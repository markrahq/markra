use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::UNIX_EPOCH;

use super::ignore_rules::MarkdownIgnoreRules;
use super::path::{is_markdown_open_file, markdown_folder_file, markdown_tree_root_for_path};
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};

const WORKSPACE_SEARCH_MAX_WORKERS: usize = 8;
const WORKSPACE_SEARCH_SNIPPET_MAX_LENGTH: usize = 96;

static WORKSPACE_SEARCH_INDEX_CACHE: OnceLock<Mutex<WorkspaceSearchIndexCache>> = OnceLock::new();

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

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchFileSignature {
    modified_at: Option<u128>,
    size_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchIndexedContent {
    text: String,
    ascii_lowercase_text: Option<String>,
}

impl WorkspaceSearchIndexedContent {
    fn new(text: String) -> Self {
        let ascii_lowercase_text = text.is_ascii().then(|| text.to_ascii_lowercase());

        Self {
            text,
            ascii_lowercase_text,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchIndexedFile {
    file: MarkdownFolderFile,
    signature: Option<WorkspaceSearchFileSignature>,
    content: Option<Arc<WorkspaceSearchIndexedContent>>,
}

#[derive(Default)]
struct WorkspaceSearchIndex {
    files: Vec<WorkspaceSearchIndexedFile>,
}

#[derive(Default)]
struct WorkspaceSearchIndexCache {
    indexes: HashMap<PathBuf, WorkspaceSearchIndex>,
}

fn collect_markdown_workspace_files(
    root: &Path,
    global_ignore_rules: Option<&str>,
) -> Result<Vec<MarkdownFolderFile>, String> {
    let mut files = Vec::new();
    let ignore_rules = MarkdownIgnoreRules::for_root(root, global_ignore_rules);

    collect_markdown_workspace_files_in(root, root, &ignore_rules, &mut files)?;
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
    ignore_rules: &MarkdownIgnoreRules,
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
            if !ignore_rules.ignores(&path, true) {
                collect_markdown_workspace_files_in(root, &path, ignore_rules, files)?;
            }
            continue;
        }

        if file_type.is_file()
            && !ignore_rules.ignores(&path, false)
            && is_markdown_open_file(&path)
        {
            files.push(markdown_folder_file(
                root,
                &path,
                MarkdownFolderEntryKind::File,
            )?);
        }
    }

    Ok(())
}

fn workspace_search_file_signature(
    file: &MarkdownFolderFile,
) -> Result<WorkspaceSearchFileSignature, String> {
    let metadata = fs::metadata(&file.path).map_err(|error| error.to_string())?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos());

    Ok(WorkspaceSearchFileSignature {
        modified_at,
        size_bytes: metadata.len(),
    })
}

fn read_workspace_search_file(file: &MarkdownFolderFile) -> Result<String, String> {
    fs::read_to_string(&file.path).map_err(|error| error.to_string())
}

fn refresh_workspace_search_index_files(
    index: &mut WorkspaceSearchIndex,
    files: Vec<MarkdownFolderFile>,
    mut signature_for_file: impl FnMut(
        &MarkdownFolderFile,
    ) -> Result<WorkspaceSearchFileSignature, String>,
    mut read_file: impl FnMut(&MarkdownFolderFile) -> Result<String, String>,
) -> Result<(), String> {
    let mut cached_files = std::mem::take(&mut index.files)
        .into_iter()
        .map(|file| (file.file.path.clone(), file))
        .collect::<HashMap<_, _>>();
    let mut indexed_files = Vec::with_capacity(files.len());

    for file in files {
        let Ok(signature) = signature_for_file(&file) else {
            indexed_files.push(WorkspaceSearchIndexedFile {
                file,
                signature: None,
                content: None,
            });
            continue;
        };

        let cached_file = cached_files.remove(&file.path);
        if let Some(cached_file) = cached_file.filter(|cached_file| {
            cached_file.signature.as_ref() == Some(&signature) && cached_file.content.is_some()
        }) {
            indexed_files.push(WorkspaceSearchIndexedFile {
                file,
                signature: Some(signature),
                content: cached_file.content,
            });
            continue;
        }

        let content = read_file(&file)
            .ok()
            .map(WorkspaceSearchIndexedContent::new)
            .map(Arc::new);
        indexed_files.push(WorkspaceSearchIndexedFile {
            file,
            signature: Some(signature),
            content,
        });
    }

    index.files = indexed_files;

    Ok(())
}

fn indexed_workspace_files_for_search(
    root: &Path,
    files: Vec<MarkdownFolderFile>,
) -> Result<Vec<WorkspaceSearchIndexedFile>, String> {
    let cache = WORKSPACE_SEARCH_INDEX_CACHE
        .get_or_init(|| Mutex::new(WorkspaceSearchIndexCache::default()));
    let mut cache = cache.lock().map_err(|error| error.to_string())?;
    let index = cache.indexes.entry(root.to_path_buf()).or_default();

    refresh_workspace_search_index_files(
        index,
        files,
        workspace_search_file_signature,
        read_workspace_search_file,
    )?;

    Ok(index.files.clone())
}

fn markdown_search_ranges(
    text: &str,
    ascii_lowercase_text: Option<&str>,
    query: &str,
    case_sensitive: bool,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    if query.is_empty() || max_matches == Some(0) {
        return Vec::new();
    }

    if case_sensitive {
        return markdown_search_ranges_exact(text, query, max_matches);
    }

    if query.is_ascii() {
        if let Some(normalized_text) = ascii_lowercase_text {
            return markdown_search_ranges_ascii_case_insensitive_normalized(
                normalized_text,
                query,
                max_matches,
            );
        }
    }

    if text.is_ascii() && query.is_ascii() {
        return markdown_search_ranges_ascii_case_insensitive(text, query, max_matches);
    }

    markdown_search_ranges_unicode_case_insensitive(text, query, max_matches)
}

fn markdown_search_ranges_exact(
    text: &str,
    query: &str,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    text.match_indices(query)
        .take(max_matches.unwrap_or(usize::MAX))
        .map(|(from, matched)| MarkdownSearchRange {
            from,
            to: from + matched.len(),
        })
        .collect()
}

fn markdown_search_ranges_ascii_case_insensitive(
    text: &str,
    query: &str,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    let normalized_text = text.to_ascii_lowercase();

    markdown_search_ranges_ascii_case_insensitive_normalized(&normalized_text, query, max_matches)
}

fn markdown_search_ranges_ascii_case_insensitive_normalized(
    normalized_text: &str,
    query: &str,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    let normalized_query = query.to_ascii_lowercase();

    normalized_text
        .match_indices(&normalized_query)
        .take(max_matches.unwrap_or(usize::MAX))
        .map(|(from, _)| MarkdownSearchRange {
            from,
            to: from + query.len(),
        })
        .collect()
}

fn markdown_search_ranges_unicode_case_insensitive(
    text: &str,
    query: &str,
    max_matches: Option<usize>,
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
            if max_matches.is_some_and(|limit| ranges.len() >= limit) {
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
    ascii_lowercase_content: Option<&str>,
    query: &str,
    case_sensitive: bool,
    max_matches_per_file: Option<usize>,
) -> (Vec<MarkdownWorkspaceSearchResult>, bool) {
    let search_limit = max_matches_per_file.map(|limit| limit.saturating_add(1));
    let mut ranges = markdown_search_ranges(
        content,
        ascii_lowercase_content,
        query,
        case_sensitive,
        search_limit,
    );
    let truncated = max_matches_per_file.is_some_and(|limit| ranges.len() > limit);
    if let Some(max_matches_per_file) = max_matches_per_file {
        ranges.truncate(max_matches_per_file);
    }

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
    indexed_file: &WorkspaceSearchIndexedFile,
    query: &str,
    case_sensitive: bool,
    current_document_path: Option<&str>,
    current_document_content: Option<&str>,
    max_matches_per_file: Option<usize>,
) -> MarkdownWorkspaceFileSearchResult {
    let (content, ascii_lowercase_content) = match (current_document_path, current_document_content)
    {
        (Some(path), Some(content)) if path == indexed_file.file.path => (content, None),
        _ => match indexed_file.content.as_ref() {
            Some(content) => (
                content.text.as_str(),
                content.ascii_lowercase_text.as_deref(),
            ),
            None => {
                return MarkdownWorkspaceFileSearchResult {
                    file_index,
                    matches: Vec::new(),
                    truncated: false,
                    unreadable: true,
                };
            }
        },
    };
    let (matches, truncated) = markdown_workspace_search_results(
        &indexed_file.file,
        content,
        ascii_lowercase_content,
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
    files: &[WorkspaceSearchIndexedFile],
    query: &str,
    case_sensitive: bool,
    current_document_path: Option<&str>,
    current_document_content: Option<&str>,
    max_matches_per_file: Option<usize>,
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
    global_ignore_rules: Option<String>,
) -> Result<MarkdownWorkspaceSearchResponse, String> {
    let normalized_query = query.trim();
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let files = collect_markdown_workspace_files(&root, global_ignore_rules.as_deref())?;
    if normalized_query.is_empty() || max_matches == Some(0) || max_matches_per_file == Some(0) {
        return Ok(MarkdownWorkspaceSearchResponse {
            results: Vec::new(),
            searched_file_count: files.len(),
            truncated: false,
            unreadable_file_count: 0,
        });
    }

    let searched_file_count = files.len();
    let indexed_files = indexed_workspace_files_for_search(&root, files)?;
    let mut results = Vec::new();
    let mut unreadable_file_count = 0;
    let mut truncated = false;
    let file_results = search_markdown_workspace_files(
        &indexed_files,
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
            if max_matches.is_some_and(|limit| results.len() >= limit) {
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
        searched_file_count,
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
    global_ignore_rules: Option<String>,
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
            global_ignore_rules,
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
            None,
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
    fn uses_root_markraignore_when_searching_workspace_files() {
        let root = std::env::temp_dir().join(format!(
            "markra-ignore-search-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let drafts = root.join("drafts");
        let generated = root.join("generated");

        fs::create_dir_all(&drafts).expect("drafts folder should be created");
        fs::create_dir_all(&generated).expect("generated folder should be created");
        fs::write(root.join(".markraignore"), "generated/\n!drafts/\n")
            .expect("ignore rules should be created");
        fs::write(drafts.join("restored.md"), "shared search marker")
            .expect("restored markdown should be created");
        fs::write(root.join("visible.md"), "shared search marker")
            .expect("visible markdown should be created");
        fs::write(generated.join("hidden.md"), "shared search marker")
            .expect("ignored markdown should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "search marker".to_string(),
            false,
            None,
            None,
            None,
            None,
            Some("drafts/\n".to_string()),
        )
        .expect("workspace search should complete");

        assert_eq!(search.searched_file_count, 2);
        assert_eq!(
            search
                .results
                .iter()
                .map(|result| result.file.relative_path.as_str())
                .collect::<Vec<_>>(),
            vec!["drafts/restored.md", "visible.md"]
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
            None,
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
    fn refreshes_workspace_search_index_incrementally() {
        let first = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: Some(1),
            path: "/synthetic/first.md".to_string(),
            relative_path: "first.md".to_string(),
            size_bytes: Some(10),
        };
        let second = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: Some(1),
            path: "/synthetic/second.md".to_string(),
            relative_path: "second.md".to_string(),
            size_bytes: Some(20),
        };
        let mut index = WorkspaceSearchIndex::default();
        let mut first_signature = WorkspaceSearchFileSignature {
            modified_at: Some(1),
            size_bytes: 10,
        };
        let second_signature = WorkspaceSearchFileSignature {
            modified_at: Some(1),
            size_bytes: 20,
        };
        let mut read_paths = Vec::new();

        refresh_workspace_search_index_files(
            &mut index,
            vec![first.clone(), second.clone()],
            |file| {
                if file.path == first.path {
                    Ok(first_signature.clone())
                } else {
                    Ok(second_signature.clone())
                }
            },
            |file| {
                read_paths.push(file.relative_path.clone());
                Ok(format!("{} Alpha", file.relative_path))
            },
        )
        .expect("index should refresh");
        assert_eq!(read_paths, vec!["first.md", "second.md"]);

        read_paths.clear();
        refresh_workspace_search_index_files(
            &mut index,
            vec![first.clone(), second.clone()],
            |file| {
                if file.path == first.path {
                    Ok(first_signature.clone())
                } else {
                    Ok(second_signature.clone())
                }
            },
            |file| {
                read_paths.push(file.relative_path.clone());
                Ok(format!("{} Beta", file.relative_path))
            },
        )
        .expect("unchanged index should refresh");
        assert!(read_paths.is_empty());

        first_signature.size_bytes = 11;
        read_paths.clear();
        refresh_workspace_search_index_files(
            &mut index,
            vec![first, second],
            |file| {
                if file.relative_path == "first.md" {
                    Ok(first_signature.clone())
                } else {
                    Ok(second_signature.clone())
                }
            },
            |file| {
                read_paths.push(file.relative_path.clone());
                Ok(format!("{} Gamma", file.relative_path))
            },
        )
        .expect("changed index should refresh");

        assert_eq!(read_paths, vec!["first.md"]);
        assert_eq!(
            index
                .files
                .iter()
                .map(|file| file.content.as_ref().map(|content| content.text.as_str()))
                .collect::<Vec<_>>(),
            vec![Some("first.md Gamma"), Some("second.md Alpha")]
        );
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
            None,
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
    fn searches_all_workspace_matches_when_limits_are_omitted() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-unlimited-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let content = (0..510)
            .map(|index| format!("alpha line {index}"))
            .collect::<Vec<_>>()
            .join("\n");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("many.md"), content).expect("markdown file should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            false,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 510);
        assert_eq!(search.truncated, false);
        assert_eq!(search.results[509].line_text, "alpha line 509");

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn refreshes_cached_workspace_search_after_disk_change() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-cache-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let note = root.join("note.md");

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(&note, "alpha from disk").expect("markdown file should be created");

        let first_search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "alpha".to_string(),
            false,
            None,
            None,
            Some(10),
            Some(5),
            None,
        )
        .expect("first workspace search should complete");
        assert_eq!(first_search.results[0].line_text, "alpha from disk");

        fs::write(&note, "beta from updated disk").expect("markdown file should be updated");
        let second_search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "beta".to_string(),
            false,
            None,
            None,
            Some(10),
            Some(5),
            None,
        )
        .expect("second workspace search should complete");

        assert_eq!(second_search.results.len(), 1);
        assert_eq!(second_search.results[0].line_text, "beta from updated disk");

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
            None,
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 1);
        assert_eq!(search.results[0].line_text, "alpha from disk");

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
