use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use super::path::path_to_string;
use super::types::PandocExportFormat;

fn encode_file_url_path(path: &str) -> String {
    let mut encoded = String::new();

    for byte in path.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                encoded.push(*byte as char)
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn file_url_from_path(path: &Path) -> String {
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    let absolute_path = if normalized_path.starts_with('/') {
        normalized_path
    } else if normalized_path.len() >= 2 && normalized_path.as_bytes()[1] == b':' {
        format!("/{normalized_path}")
    } else {
        format!("/{normalized_path}")
    };

    format!("file://{}", encode_file_url_path(&absolute_path))
}

fn browser_pdf_arguments(
    source_path: &Path,
    target_path: &Path,
    profile_path: &Path,
) -> Vec<String> {
    vec![
        "--headless=new".to_string(),
        "--disable-gpu".to_string(),
        "--allow-file-access-from-files".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-component-update".to_string(),
        "--disable-extensions".to_string(),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        format!("--user-data-dir={}", profile_path.display()),
        "--no-pdf-header-footer".to_string(),
        format!("--print-to-pdf={}", target_path.display()),
        file_url_from_path(source_path),
    ]
}

fn path_executable(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;

    for directory in std::env::split_paths(&path) {
        let candidate = directory.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(target_os = "windows")]
        {
            let exe_candidate = directory.join(format!("{name}.exe"));
            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }

    None
}

fn pdf_renderer_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            PathBuf::from("/Applications/Chromium.app/Contents/MacOS/Chromium"),
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ]);
    }

    #[cfg(target_os = "windows")]
    {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"] {
            if let Some(base_path) = std::env::var_os(variable) {
                let base_path = PathBuf::from(base_path);
                candidates.extend([
                    base_path.join("Google/Chrome/Application/chrome.exe"),
                    base_path.join("Chromium/Application/chrome.exe"),
                    base_path.join("Microsoft/Edge/Application/msedge.exe"),
                ]);
            }
        }
    }

    for executable in [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "microsoft-edge-stable",
        "msedge",
    ] {
        if let Some(candidate) = path_executable(executable) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn find_pdf_renderer() -> Option<PathBuf> {
    pdf_renderer_candidates()
        .into_iter()
        .find(|candidate| candidate.is_file())
}

fn pandoc_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for executable in ["pandoc"] {
        if let Some(candidate) = path_executable(executable) {
            candidates.push(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.extend([
            PathBuf::from("/opt/homebrew/bin/pandoc"),
            PathBuf::from("/usr/local/bin/pandoc"),
        ]);
    }

    candidates
}

fn detect_pandoc_path_from_candidates(
    candidates: impl IntoIterator<Item = PathBuf>,
) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.is_file())
}

fn find_pandoc(path: &str) -> Result<PathBuf, String> {
    let trimmed_path = path.trim();
    if !trimmed_path.is_empty() {
        let candidate = PathBuf::from(trimmed_path);
        if candidate.is_file() {
            return Ok(candidate);
        }

        return Err(format!("Pandoc executable not found: {trimmed_path}"));
    }

    detect_pandoc_path_from_candidates(pandoc_candidates()).ok_or_else(|| {
            "Pandoc export requires Pandoc. Install Pandoc or set the executable path in Export settings."
                .to_string()
        })
}

fn unique_pandoc_export_temp_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    std::env::temp_dir().join(format!(
        "markra-pandoc-export-{}-{nanos}",
        std::process::id()
    ))
}

fn parse_pandoc_extra_args(args: &str) -> Result<Vec<String>, String> {
    let mut parsed = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;

    for character in args.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }

        if character == '\\' {
            escaped = true;
            continue;
        }

        if let Some(quote_character) = quote {
            if character == quote_character {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }

        if character == '\'' || character == '"' {
            quote = Some(character);
            continue;
        }

        if character.is_whitespace() {
            if !current.is_empty() {
                parsed.push(current);
                current = String::new();
            }
            continue;
        }

        current.push(character);
    }

    if escaped {
        current.push('\\');
    }

    if quote.is_some() {
        return Err("Pandoc arguments contain an unterminated quote".to_string());
    }

    if !current.is_empty() {
        parsed.push(current);
    }

    Ok(parsed)
}

fn parent_directory_from_path(path: &str) -> Option<PathBuf> {
    PathBuf::from(path).parent().map(Path::to_path_buf)
}

fn pandoc_working_directory(document_path: Option<&str>, target_path: &Path) -> PathBuf {
    document_path
        .and_then(parent_directory_from_path)
        .or_else(|| target_path.parent().map(Path::to_path_buf))
        .unwrap_or_else(std::env::temp_dir)
}

fn unique_pdf_export_temp_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);

    std::env::temp_dir().join(format!("markra-pdf-export-{}-{nanos}", std::process::id()))
}

fn pdf_output_file_size(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .map(|metadata| metadata.len())
        .filter(|size| *size > 0)
}

fn run_pdf_renderer_process_with_timeout(
    binary: &Path,
    args: &[String],
    target_path: &Path,
    timeout: Duration,
    poll_interval: Duration,
    stable_output_duration: Duration,
) -> Result<bool, String> {
    let mut child = Command::new(binary)
        .args(args)
        .spawn()
        .map_err(|error| format!("Failed to launch PDF renderer: {error}"))?;
    let started_at = Instant::now();
    let mut last_output_size = 0;
    let mut stable_output_since: Option<Instant> = None;

    loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Ok(status.success());
        }

        let now = Instant::now();
        if let Some(output_size) = pdf_output_file_size(target_path) {
            if output_size == last_output_size {
                let stable_since = stable_output_since.get_or_insert(now);
                if now.duration_since(*stable_since) >= stable_output_duration {
                    let _kill_result = child.kill();
                    let _wait_result = child.wait();
                    return Ok(true);
                }
            } else {
                last_output_size = output_size;
                stable_output_since = Some(now);
            }
        }

        if now.duration_since(started_at) >= timeout {
            let _kill_result = child.kill();
            let _wait_result = child.wait();
            return Ok(false);
        }

        thread::sleep(poll_interval);
    }
}

fn run_pdf_renderer_process(
    binary: &Path,
    args: &[String],
    target_path: &Path,
) -> Result<bool, String> {
    run_pdf_renderer_process_with_timeout(
        binary,
        args,
        target_path,
        Duration::from_secs(45),
        Duration::from_millis(100),
        Duration::from_millis(700),
    )
}

fn export_pdf_file_with_renderer(
    path: String,
    html: String,
    renderer_path: &Path,
    mut render: impl FnMut(&Path, &Path, &Path, &[String]) -> Result<bool, String>,
) -> Result<(), String> {
    if html.trim().is_empty() {
        return Err("PDF export HTML is empty".to_string());
    }

    let target_path = PathBuf::from(path);
    let temp_root = unique_pdf_export_temp_dir();
    let source_path = temp_root.join("index.html");
    let output_path = temp_root.join("output.pdf");
    let profile_path = temp_root.join("profile");

    fs::create_dir_all(&profile_path).map_err(|error| error.to_string())?;
    fs::write(&source_path, html).map_err(|error| error.to_string())?;

    let result = (|| {
        let args = browser_pdf_arguments(&source_path, &output_path, &profile_path);
        if !render(renderer_path, &source_path, &output_path, &args)? {
            return Err("PDF renderer failed".to_string());
        }

        let metadata = fs::metadata(&output_path)
            .map_err(|_| "PDF renderer did not create output file".to_string())?;
        if metadata.len() == 0 {
            return Err("PDF renderer created an empty file".to_string());
        }

        fs::copy(&output_path, &target_path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    let _cleanup_result = fs::remove_dir_all(&temp_root);

    result
}

fn run_pandoc_process(
    binary: &Path,
    working_directory: &Path,
    args: &[String],
) -> Result<bool, String> {
    let status = Command::new(binary)
        .current_dir(working_directory)
        .args(args)
        .status()
        .map_err(|error| format!("Failed to launch Pandoc: {error}"))?;

    Ok(status.success())
}

fn export_pandoc_file_with_runner(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: Option<PathBuf>,
    pandoc_args: String,
    mut run: impl FnMut(&Path, &Path, &Path, &Path, &[String]) -> Result<bool, String>,
) -> Result<(), String> {
    if markdown.trim().is_empty() {
        return Err("Pandoc export Markdown is empty".to_string());
    }

    let target_path = PathBuf::from(path);
    let pandoc_binary = pandoc_path.ok_or_else(|| "Pandoc executable is required".to_string())?;
    let temp_root = unique_pandoc_export_temp_dir();
    let source_path = temp_root.join("input.md");
    let output_path = temp_root.join(format!("output.{}", format.extension()));
    let working_directory = pandoc_working_directory(document_path.as_deref(), &target_path);

    fs::create_dir_all(&temp_root).map_err(|error| error.to_string())?;
    fs::write(&source_path, markdown).map_err(|error| error.to_string())?;

    let result = (|| {
        let mut args = parse_pandoc_extra_args(&pandoc_args)?;

        if let Some(resource_path) = document_path
            .as_deref()
            .and_then(parent_directory_from_path)
        {
            args.push(format!("--resource-path={}", resource_path.display()));
        }

        args.extend([
            "--from".to_string(),
            "gfm+tex_math_dollars+tex_math_single_backslash".to_string(),
            "--to".to_string(),
            format.pandoc_writer().to_string(),
            "--output".to_string(),
            output_path.to_string_lossy().to_string(),
            source_path.to_string_lossy().to_string(),
        ]);

        if !run(
            &pandoc_binary,
            &source_path,
            &output_path,
            &working_directory,
            &args,
        )? {
            return Err("Pandoc export failed".to_string());
        }

        let metadata = fs::metadata(&output_path)
            .map_err(|_| "Pandoc did not create an output file".to_string())?;
        if metadata.len() == 0 {
            return Err("Pandoc created an empty output file".to_string());
        }

        fs::copy(&output_path, &target_path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    let _cleanup_result = fs::remove_dir_all(&temp_root);

    result
}

#[tauri::command]
pub(crate) async fn export_pdf_file(path: String, html: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export_pdf_file_blocking(path, html))
        .await
        .map_err(|error| format!("PDF export task failed: {error}"))?
}

fn export_pdf_file_blocking(path: String, html: String) -> Result<(), String> {
    let renderer_path = find_pdf_renderer().ok_or_else(|| {
        "PDF export requires Google Chrome, Chromium, or Microsoft Edge".to_string()
    })?;

    export_pdf_file_with_renderer(
        path,
        html,
        &renderer_path,
        |binary, _source_path, output_path, args| {
            let renderer_succeeded = run_pdf_renderer_process(binary, args, output_path)?;
            if !renderer_succeeded {
                return Ok(false);
            }

            Ok(pdf_output_file_size(output_path).is_some())
        },
    )
}

#[tauri::command]
pub(crate) async fn export_pandoc_file(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: String,
    pandoc_args: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_pandoc_file_blocking(
            path,
            markdown,
            format,
            document_path,
            pandoc_path,
            pandoc_args,
        )
    })
    .await
    .map_err(|error| format!("Pandoc export task failed: {error}"))?
}

fn export_pandoc_file_blocking(
    path: String,
    markdown: String,
    format: PandocExportFormat,
    document_path: Option<String>,
    pandoc_path: String,
    pandoc_args: String,
) -> Result<(), String> {
    let pandoc_binary = find_pandoc(&pandoc_path)?;

    export_pandoc_file_with_runner(
        path,
        markdown,
        format,
        document_path,
        Some(pandoc_binary),
        pandoc_args,
        |binary, _source_path, _output_path, working_directory, args| {
            run_pandoc_process(binary, working_directory, args)
        },
    )
}

#[tauri::command]
pub(crate) async fn check_pandoc_available(pandoc_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || check_pandoc_available_blocking(pandoc_path))
        .await
        .map_err(|error| format!("Pandoc check task failed: {error}"))?
}

fn check_pandoc_available_blocking(pandoc_path: String) -> Result<(), String> {
    find_pandoc(&pandoc_path).map(|_| ())
}

#[tauri::command]
pub(crate) async fn detect_pandoc_path() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(detect_pandoc_path_blocking)
        .await
        .map_err(|error| format!("Pandoc detection task failed: {error}"))
}

fn detect_pandoc_path_blocking() -> Option<String> {
    detect_pandoc_path_from_candidates(pandoc_candidates()).map(|path| path_to_string(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_pdf_html_with_browser_renderer() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let renderer = PathBuf::from("/mock/Chrome");

        fs::create_dir_all(&root).expect("test folder should be created");
        export_pdf_file_with_renderer(
            pdf.to_string_lossy().to_string(),
            "<!doctype html><html><body><h1>中文标题</h1></body></html>".to_string(),
            &renderer,
            |binary, source_path, output_path, args| {
                assert_eq!(binary, renderer.as_path());
                assert!(fs::read_to_string(source_path)
                    .expect("source html should be readable")
                    .contains("中文标题"));
                assert!(args.contains(&"--headless=new".to_string()));
                assert!(args.contains(&"--no-pdf-header-footer".to_string()));
                assert_ne!(output_path, pdf.as_path());
                assert!(args.contains(&format!("--print-to-pdf={}", output_path.display())));
                assert!(args
                    .last()
                    .expect("source file URL should be passed")
                    .starts_with("file://"));
                fs::write(output_path, b"%PDF-1.7\n").expect("mock pdf should be written");
                Ok(true)
            },
        )
        .expect("pdf should be exported");

        assert_eq!(
            fs::read(&pdf).expect("pdf file should be readable"),
            b"%PDF-1.7\n"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn rejects_empty_pdf_export_html() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-empty-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let renderer = PathBuf::from("/mock/Chrome");
        let mut renderer_called = false;

        fs::create_dir_all(&root).expect("test folder should be created");
        let result = export_pdf_file_with_renderer(
            pdf.to_string_lossy().to_string(),
            "   ".to_string(),
            &renderer,
            |_binary, _source_path, _output_path, _args| {
                renderer_called = true;
                Ok(true)
            },
        );

        assert_eq!(result, Err("PDF export HTML is empty".to_string()));
        assert!(!renderer_called);

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn parses_quoted_pandoc_arguments() {
        assert_eq!(
            parse_pandoc_extra_args("--toc --metadata title=\"Draft Notes\""),
            Ok(vec![
                "--toc".to_string(),
                "--metadata".to_string(),
                "title=Draft Notes".to_string()
            ])
        );
        assert_eq!(
            parse_pandoc_extra_args("--metadata title=\"Draft"),
            Err("Pandoc arguments contain an unterminated quote".to_string())
        );
    }

    #[test]
    fn rejects_missing_explicit_pandoc_path_before_export() {
        assert_eq!(
            check_pandoc_available_blocking("/mock/missing/pandoc".to_string()),
            Err("Pandoc executable not found: /mock/missing/pandoc".to_string())
        );
    }

    #[test]
    fn detects_first_existing_pandoc_candidate() {
        let root = std::env::temp_dir().join(format!(
            "markra-pandoc-detect-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let missing = root.join("missing-pandoc");
        let pandoc = root.join("pandoc");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&pandoc, b"mock").expect("mock pandoc should be written");

        assert_eq!(
            detect_pandoc_path_from_candidates([missing, pandoc.clone()]),
            Some(pandoc)
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn exports_markdown_with_pandoc_runner() {
        let root = std::env::temp_dir().join(format!(
            "markra-pandoc-export-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("notes").join("draft.md");
        let target = root.join("draft.docx");
        let pandoc = PathBuf::from("/mock/pandoc");

        fs::create_dir_all(note.parent().expect("note should have parent"))
            .expect("test folder should be created");
        export_pandoc_file_with_runner(
            target.to_string_lossy().to_string(),
            "# Draft\n\n![Chart](assets/chart.png)".to_string(),
            PandocExportFormat::Docx,
            Some(note.to_string_lossy().to_string()),
            Some(pandoc.clone()),
            "--toc --metadata title=\"Draft Notes\"".to_string(),
            |binary, input_path, output_path, working_directory, args| {
                assert_eq!(binary, pandoc.as_path());
                assert_eq!(
                    working_directory,
                    note.parent().expect("note should have parent")
                );
                assert!(fs::read_to_string(input_path)
                    .expect("source markdown should be readable")
                    .contains("![Chart](assets/chart.png)"));
                assert!(args.contains(&"--toc".to_string()));
                assert!(args.contains(&"--metadata".to_string()));
                assert!(args.contains(&"title=Draft Notes".to_string()));
                assert!(args.windows(2).any(|window| {
                    window[0] == "--from"
                        && window[1] == "gfm+tex_math_dollars+tex_math_single_backslash"
                }));
                assert!(args
                    .windows(2)
                    .any(|window| window[0] == "--to" && window[1] == "docx"));
                assert!(args
                    .windows(2)
                    .any(|window| window[0] == "--output"
                        && window[1] == output_path.to_string_lossy()));
                assert_eq!(args.last(), Some(&input_path.to_string_lossy().to_string()));
                fs::write(output_path, b"mock-docx").expect("mock export should be written");
                Ok(true)
            },
        )
        .expect("pandoc export should succeed");

        assert_eq!(
            fs::read(&target).expect("export file should be readable"),
            b"mock-docx"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn accepts_stable_pdf_output_when_renderer_keeps_running() {
        let root = std::env::temp_dir().join(format!(
            "markra-pdf-renderer-hang-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let pdf = root.join("draft.pdf");
        let script = "printf '%s' '%PDF-1.7' > \"$1\"; while :; do :; done";
        let args = vec![
            "-c".to_string(),
            script.to_string(),
            "sh".to_string(),
            pdf.to_string_lossy().to_string(),
        ];

        fs::create_dir_all(&root).expect("test folder should be created");

        assert_eq!(
            run_pdf_renderer_process_with_timeout(
                Path::new("/bin/sh"),
                &args,
                &pdf,
                Duration::from_secs(1),
                Duration::from_millis(20),
                Duration::from_millis(80),
            ),
            Ok(true)
        );
        assert_eq!(
            fs::read(&pdf).expect("pdf file should be readable"),
            b"%PDF-1.7"
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
