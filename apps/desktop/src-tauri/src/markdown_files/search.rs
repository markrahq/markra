use std::fs;
use std::path::{Path, PathBuf};
use std::thread;

use super::path::{
    is_markdown_open_file, markdown_folder_file, markdown_tree_root_for_path,
    should_skip_markdown_tree_directory,
};
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};

const WORKSPACE_SEARCH_DEFAULT_MAX_MATCHES: usize = 500;
const WORKSPACE_SEARCH_DEFAULT_MAX_MATCHES_PER_FILE: usize = 50;
const WORKSPACE_SEARCH_MAX_WORKERS: usize = 8;
const WORKSPACE_SEARCH_SNIPPET_MAX_LENGTH: usize = 96;

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownSearchRange {
    pub(crate) from: usize,
    pub(crate) to: usize,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownWorkspaceSearchResult {
    pub(crate) column_number: usize,
    pub(crate) file: MarkdownFolderFile,
    pub(crate) id: String,
    pub(crate) line_number: usize,
    pub(crate) line_text: String,
    #[serde(rename = "match")]
    pub(crate) matched_range: MarkdownSearchRange,
    pub(crate) match_index: usize,
    pub(crate) snippet: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownWorkspaceSearchResponse {
    pub(crate) results: Vec<MarkdownWorkspaceSearchResult>,
    pub(crate) searched_file_count: usize,
    pub(crate) truncated: bool,
    pub(crate) unreadable_file_count: usize,
}

fn collect_markdown_workspace_files(root: &Path) -> Result<Vec<MarkdownFolderFile>, String> {
    let mut files = Vec::new();

    collect_markdown_workspace_files_in(root, root, &mut files)?;
    files.sort_by(|a, b| {
        a.relative_path
            .to_lowercase()
            .cmp(&b.relative_path.to_lowercase())
    });

    Ok(files)
}

fn collect_markdown_workspace_files_in(
    root: &Path,
    directory: &Path,
    files: &mut Vec<MarkdownFolderFile>,
) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    entries.sort_by(|a, b| {
        a.file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&b.file_name().to_string_lossy().to_lowercase())
    });

    for entry in entries {
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if !should_skip_markdown_tree_directory(&path) {
                collect_markdown_workspace_files_in(root, &path, files)?;
            }
            continue;
        }

        if file_type.is_file() && is_markdown_open_file(&path) {
            files.push(markdown_folder_file(
                root,
                &path,
                MarkdownFolderEntryKind::File,
            )?);
        }
    }

    Ok(())
}

fn markdown_search_ranges(
    text: &str,
    query: &str,
    case_sensitive: bool,
    max_matches: usize,
) -> Vec<MarkdownSearchRange> {
    if query.is_empty() || max_matches == 0 {
        return Vec::new();
    }

    if case_sensitive {
        return markdown_search_ranges_exact(text, query, max_matches);
    }

    if text.is_ascii() && query.is_ascii() {
        return markdown_search_ranges_ascii_case_insensitive(text, query, max_matches);
    }

    markdown_search_ranges_unicode_case_insensitive(text, query, max_matches)
}

fn markdown_search_ranges_exact(
    text: &str,
    query: &str,
    max_matches: usize,
) -> Vec<MarkdownSearchRange> {
    text.match_indices(query)
        .take(max_matches)
        .map(|(from, matched)| MarkdownSearchRange {
            from,
            to: from + matched.len(),
        })
        .collect()
}

fn markdown_search_ranges_ascii_case_insensitive(
    text: &str,
    query: &str,
    max_matches: usize,
) -> Vec<MarkdownSearchRange> {
    let normalized_text = text.to_ascii_lowercase();
    let normalized_query = query.to_ascii_lowercase();

    normalized_text
        .match_indices(&normalized_query)
        .take(max_matches)
        .map(|(from, _)| MarkdownSearchRange {
            from,
            to: from + query.len(),
        })
        .collect()
}

fn markdown_search_ranges_unicode_case_insensitive(
    text: &str,
    query: &str,
    max_matches: usize,
) -> Vec<MarkdownSearchRange> {
    let query_char_count = query.chars().count();
    if query_char_count == 0 {
        return Vec::new();
    }

    let needle = query.to_lowercase();
    let char_starts = text
        .char_indices()
        .map(|(index, _)| index)
        .chain(std::iter::once(text.len()))
        .collect::<Vec<_>>();

    if char_starts.len() <= query_char_count {
        return Vec::new();
    }

    let mut ranges = Vec::new();
    let mut char_index = 0;
    while char_index + query_char_count < char_starts.len() {
        let from = char_starts[char_index];
        let to = char_starts[char_index + query_char_count];
        let candidate = &text[from..to];

        if candidate.to_lowercase() == needle {
            ranges.push(MarkdownSearchRange { from, to });
            if ranges.len() >= max_matches {
                break;
            }
            char_index += query_char_count.max(1);
            continue;
        }

        char_index += 1;
    }

    ranges
}

fn markdown_search_line(content: &str, range: &MarkdownSearchRange) -> (usize, usize, String) {
    let line_start = content[..range.from]
        .rfind('\n')
        .map_or(0, |index| index + 1);
    let line_end = content[range.from..]
        .find('\n')
        .map_or(content.len(), |index| range.from + index);
    let line_number = content[..range.from]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1;
    let column_number = content[line_start..range.from].chars().count() + 1;

    (
        line_number,
        column_number,
        content[line_start..line_end].to_string(),
    )
}

fn char_slice(text: &str, start: usize, end: usize) -> String {
    text.chars()
        .skip(start)
        .take(end.saturating_sub(start))
        .collect()
}

fn markdown_search_snippet(line_text: &str, column_number: usize, match_length: usize) -> String {
    let normalized_line = line_text.trim_end();
    let line_length = normalized_line.chars().count();
    if line_length <= WORKSPACE_SEARCH_SNIPPET_MAX_LENGTH {
        return normalized_line.to_string();
    }

    let match_start = column_number.saturating_sub(1);
    let match_end = match_start + match_length;
    let radius = WORKSPACE_SEARCH_SNIPPET_MAX_LENGTH.saturating_sub(match_length) / 2;
    let start = match_start.saturating_sub(radius);
    let end = line_length.min(match_end + radius);
    let prefix = if start > 0 { "..." } else { "" };
    let suffix = if end < line_length { "..." } else { "" };

    format!(
        "{prefix}{}{suffix}",
        char_slice(normalized_line, start, end)
    )
}

fn markdown_workspace_search_results(
    file: &MarkdownFolderFile,
    content: &str,
    query: &str,
    case_sensitive: bool,
    max_matches_per_file: usize,
) -> (Vec<MarkdownWorkspaceSearchResult>, bool) {
    let search_limit = max_matches_per_file.saturating_add(1);
    let mut ranges = markdown_search_ranges(content, query, case_sensitive, search_limit);
    let truncated = ranges.len() > max_matches_per_file;
    ranges.truncate(max_matches_per_file);

    let results = ranges
        .into_iter()
        .enumerate()
        .map(|(match_index, range)| {
            let (line_number, column_number, line_text) = markdown_search_line(content, &range);
            let match_length = content[range.from..range.to].chars().count();

            MarkdownWorkspaceSearchResult {
                column_number,
                file: file.clone(),
                id: format!("{}:{}", file.path, range.from),
                line_number,
                snippet: markdown_search_snippet(&line_text, column_number, match_length),
                line_text,
                matched_range: range,
                match_index,
            }
        })
        .collect();

    (results, truncated)
}

struct MarkdownWorkspaceFileSearchResult {
    file_index: usize,
    matches: Vec<MarkdownWorkspaceSearchResult>,
    truncated: bool,
    unreadable: bool,
}

fn workspace_search_worker_count(file_count: usize, available_parallelism: usize) -> usize {
    if file_count == 0 {
        return 0;
    }

    available_parallelism
        .max(1)
        .min(WORKSPACE_SEARCH_MAX_WORKERS)
        .min(file_count)
}

fn search_markdown_workspace_file(
    file_index: usize,
    file: &MarkdownFolderFile,
    query: &str,
    case_sensitive: bool,
    current_document_path: Option<&str>,
    current_document_content: Option<&str>,
    max_matches_per_file: usize,
) -> MarkdownWorkspaceFileSearchResult {
    let content = match (current_document_path, current_document_content) {
        (Some(path), Some(content)) if path == file.path => content.to_string(),
        _ => {
            let Ok(content) = fs::read_to_string(&file.path) else {
                return MarkdownWorkspaceFileSearchResult {
                    file_index,
                    matches: Vec::new(),
                    truncated: false,
                    unreadable: true,
                };
            };

            content
        }
    };
    let (matches, truncated) = markdown_workspace_search_results(
        file,
        &content,
        query,
        case_sensitive,
        max_matches_per_file,
    );

    MarkdownWorkspaceFileSearchResult {
        file_index,
        matches,
        truncated,
        unreadable: false,
    }
}

fn search_markdown_workspace_files(
    files: &[MarkdownFolderFile],
    query: &str,
    case_sensitive: bool,
    current_document_path: Option<&str>,
    current_document_content: Option<&str>,
    max_matches_per_file: usize,
) -> Result<Vec<MarkdownWorkspaceFileSearchResult>, String> {
    let available_parallelism = thread::available_parallelism().map_or(1, |count| count.get());
    let worker_count = workspace_search_worker_count(files.len(), available_parallelism);

    if worker_count <= 1 {
        return Ok(files
            .iter()
            .enumerate()
            .map(|(file_index, file)| {
                search_markdown_workspace_file(
                    file_index,
                    file,
                    query,
                    case_sensitive,
                    current_document_path,
                    current_document_content,
                    max_matches_per_file,
                )
            })
            .collect());
    }

    let chunk_size = (files.len() + worker_count - 1) / worker_count;
    let mut file_results = thread::scope(|scope| {
        let mut handles = Vec::new();

        for (chunk_index, chunk) in files.chunks(chunk_size).enumerate() {
            let start_index = chunk_index * chunk_size;

            handles.push(scope.spawn(move || {
                chunk
                    .iter()
                    .enumerate()
                    .map(|(offset, file)| {
                        search_markdown_workspace_file(
                            start_index + offset,
                            file,
                            query,
                            case_sensitive,
                            current_document_path,
                            current_document_content,
                            max_matches_per_file,
                        )
                    })
                    .collect::<Vec<_>>()
            }));
        }

        let mut file_results = Vec::with_capacity(files.len());
        for handle in handles {
            let mut chunk_results = handle
                .join()
                .map_err(|_| "Workspace search worker failed".to_string())?;
            file_results.append(&mut chunk_results);
        }

        Ok::<Vec<MarkdownWorkspaceFileSearchResult>, String>(file_results)
    })?;

    file_results.sort_by_key(|result| result.file_index);

    Ok(file_results)
}

fn search_markdown_files_for_path_blocking(
    path: String,
    query: String,
    case_sensitive: bool,
    current_document_path: Option<String>,
    current_document_content: Option<String>,
    max_matches: Option<usize>,
    max_matches_per_file: Option<usize>,
) -> Result<MarkdownWorkspaceSearchResponse, String> {
    let normalized_query = query.trim();
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let files = collect_markdown_workspace_files(&root)?;
    let max_matches = max_matches.unwrap_or(WORKSPACE_SEARCH_DEFAULT_MAX_MATCHES);
    let max_matches_per_file =
        max_matches_per_file.unwrap_or(WORKSPACE_SEARCH_DEFAULT_MAX_MATCHES_PER_FILE);

    if normalized_query.is_empty() || max_matches == 0 || max_matches_per_file == 0 {
        return Ok(MarkdownWorkspaceSearchResponse {
            results: Vec::new(),
            searched_file_count: files.len(),
            truncated: false,
            unreadable_file_count: 0,
        });
    }

    let mut results = Vec::new();
    let mut unreadable_file_count = 0;
    let mut truncated = false;
    let file_results = search_markdown_workspace_files(
        &files,
        normalized_query,
        case_sensitive,
        current_document_path.as_deref(),
        current_document_content.as_deref(),
        max_matches_per_file,
    )?;

    for file_result in file_results {
        if file_result.unreadable {
            unreadable_file_count += 1;
            continue;
        }

        if file_result.truncated {
            truncated = true;
        }

        let mut reached_result_limit = false;
        for result in file_result.matches {
            if results.len() >= max_matches {
                truncated = true;
                reached_result_limit = true;
                break;
            }

            results.push(result);
        }

        if reached_result_limit {
            break;
        }
    }

    Ok(MarkdownWorkspaceSearchResponse {
        results,
        searched_file_count: files.len(),
        truncated,
        unreadable_file_count,
    })
}

#[tauri::command]
pub(crate) async fn search_markdown_files_for_path(
    path: String,
    query: String,
    case_sensitive: bool,
    current_document_path: Option<String>,
    current_document_content: Option<String>,
    max_matches: Option<usize>,
    max_matches_per_file: Option<usize>,
) -> Result<MarkdownWorkspaceSearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        search_markdown_files_for_path_blocking(
            path,
            query,
            case_sensitive,
            current_document_path,
            current_document_content,
            max_matches,
            max_matches_per_file,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn searches_markdown_workspace_files_by_content() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");
        let assets = root.join("assets");
        let ignored = root.join("node_modules");

        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::create_dir_all(&assets).expect("assets folder should be created");
        fs::create_dir_all(&ignored).expect("ignored folder should be created");
        fs::write(
            root.join("guide.md"),
            "# Alpha guide\nbeta notes\nanother alpha marker",
        )
        .expect("guide markdown should be created");
        fs::write(docs.join("release.markdown"), "release plan\nALPHA rollout")
            .expect("release markdown should be created");
        fs::write(assets.join("image.png"), [1, 2, 3]).expect("asset should be created");
        fs::write(ignored.join("dependency.md"), "alpha dependency")
            .expect("ignored markdown should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            false,
            None,
            None,
            Some(10),
            Some(5),
        )
        .expect("workspace search should complete");

        assert_eq!(search.searched_file_count, 2);
        assert_eq!(search.unreadable_file_count, 0);
        assert_eq!(search.truncated, false);
        assert_eq!(
            search
                .results
                .iter()
                .map(|result| (
                    result.file.relative_path.as_str(),
                    result.line_number,
                    result.column_number,
                    result.line_text.as_str(),
                    result.match_index
                ))
                .collect::<Vec<_>>(),
            vec![
                ("docs/release.markdown", 2, 1, "ALPHA rollout", 0),
                ("guide.md", 1, 3, "# Alpha guide", 0),
                ("guide.md", 3, 9, "another alpha marker", 1),
            ]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn searches_supported_text_workspace_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-text-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("note.txt"), "alpha plain text").expect("text file should be created");
        fs::write(root.join("data.json"), "{\"label\":\"alpha\"}")
            .expect("unsupported text file should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            false,
            None,
            None,
            Some(10),
            Some(5),
        )
        .expect("workspace search should complete");

        assert_eq!(
            search
                .results
                .iter()
                .map(|result| result.file.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["note.txt"]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn limits_workspace_search_worker_count() {
        assert_eq!(workspace_search_worker_count(0, 8), 0);
        assert_eq!(workspace_search_worker_count(1, 8), 1);
        assert_eq!(workspace_search_worker_count(3, 8), 3);
        assert_eq!(workspace_search_worker_count(20, 4), 4);
        assert_eq!(workspace_search_worker_count(200, 64), 8);
        assert_eq!(workspace_search_worker_count(20, 0), 1);
    }

    #[test]
    fn searches_markdown_workspace_files_with_limits_and_case_sensitivity() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-limit-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("first.md"), "alpha\nAlpha\nalpha")
            .expect("first markdown should be created");
        fs::write(root.join("second.md"), "alpha").expect("second markdown should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            true,
            None,
            None,
            Some(2),
            Some(1),
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 2);
        assert_eq!(search.truncated, true);
        assert_eq!(
            search
                .results
                .iter()
                .map(|result| (
                    result.file.relative_path.as_str(),
                    result.line_number,
                    result.line_text.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![("first.md", 1, "alpha"), ("second.md", 1, "alpha")]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn searches_disk_content_when_current_document_override_is_incomplete() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-current-document-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "alpha from disk").expect("markdown file should be created");
        let canonical_note = note
            .canonicalize()
            .expect("test note should have a canonical path");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            false,
            Some(canonical_note.to_string_lossy().to_string()),
            None,
            Some(10),
            Some(5),
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 1);
        assert_eq!(search.results[0].line_text, "alpha from disk");

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
