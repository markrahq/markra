#[cfg(test)]
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};
use tauri::Manager;

use super::path::{
    is_markdown_open_file, markdown_folder_file, markdown_tree_root_for_path,
    should_skip_markdown_tree_directory,
};
use super::types::{MarkdownFolderEntryKind, MarkdownFolderFile};

const WORKSPACE_SEARCH_MAX_WORKERS: usize = 8;
const WORKSPACE_SEARCH_SNIPPET_MAX_LENGTH: usize = 96;
const WORKSPACE_SEARCH_INDEX_FORMAT_VERSION: u32 = 1;

static WORKSPACE_SEARCH_INDEX_CACHE: OnceLock<Mutex<WorkspaceSearchIndexCache>> = OnceLock::new();
#[cfg(test)]
thread_local! {
    static WORKSPACE_SEARCH_RANGE_SCAN_COUNT: Cell<usize> = const { Cell::new(0) };
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WorkspaceSearchMatchStrategy {
    Exact,
    AsciiCaseInsensitive,
    UnicodeCaseInsensitive,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchTextMatcher {
    query: String,
    strategy: WorkspaceSearchMatchStrategy,
    normalized_query: Option<String>,
    query_char_count: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WorkspaceSearchScope {
    Content,
    File,
    Path,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchQueryTerm {
    matcher: WorkspaceSearchTextMatcher,
    scope: WorkspaceSearchScope,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct WorkspaceSearchQueryGroup {
    exclude: Vec<WorkspaceSearchQueryTerm>,
    include: Vec<WorkspaceSearchQueryTerm>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct WorkspaceSearchQueryPlan {
    groups: Vec<WorkspaceSearchQueryGroup>,
    query: String,
}

struct WorkspaceSearchParsedToken {
    excluded: bool,
    term: WorkspaceSearchQueryTerm,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceSearchIndex {
    version: u32,
    root: String,
    files: Vec<PersistedWorkspaceSearchIndexedFile>,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceSearchIndexedFile {
    created_at: Option<u64>,
    modified_at: Option<u64>,
    path: String,
    relative_path: String,
    signature: PersistedWorkspaceSearchFileSignature,
    text: String,
}

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistedWorkspaceSearchFileSignature {
    modified_at: Option<String>,
    size_bytes: u64,
}

fn plan_workspace_search_query(
    query: &str,
    case_sensitive: bool,
) -> Option<WorkspaceSearchQueryPlan> {
    let query = query.trim();
    if query.is_empty() {
        return None;
    }

    let tokens = tokenize_workspace_search_query(query);
    let mut groups = Vec::new();
    let mut current_group = WorkspaceSearchQueryGroup::default();

    for token in tokens {
        if token == "OR" {
            push_workspace_search_query_group(&mut groups, &mut current_group);
            continue;
        }

        let Some(parsed_token) = parse_workspace_search_token(&token, case_sensitive) else {
            continue;
        };

        if parsed_token.excluded {
            current_group.exclude.push(parsed_token.term);
        } else {
            current_group.include.push(parsed_token.term);
        }
    }

    push_workspace_search_query_group(&mut groups, &mut current_group);
    if groups.is_empty() {
        return None;
    }

    Some(WorkspaceSearchQueryPlan {
        groups,
        query: query.to_string(),
    })
}

fn push_workspace_search_query_group(
    groups: &mut Vec<WorkspaceSearchQueryGroup>,
    current_group: &mut WorkspaceSearchQueryGroup,
) {
    if current_group.include.is_empty() && current_group.exclude.is_empty() {
        return;
    }

    groups.push(std::mem::take(current_group));
}

fn tokenize_workspace_search_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote = None;
    let mut escaped = false;

    for character in query.chars() {
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

        if character == '"' || character == '\'' {
            quote = Some(character);
            continue;
        }

        if character.is_whitespace() {
            if !current.is_empty() {
                tokens.push(current);
                current = String::new();
            }
            continue;
        }

        current.push(character);
    }

    if escaped {
        current.push('\\');
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn parse_workspace_search_token(
    token: &str,
    default_case_sensitive: bool,
) -> Option<WorkspaceSearchParsedToken> {
    let (excluded, token) = token
        .strip_prefix('-')
        .map_or((false, token), |stripped| (true, stripped));
    if token.is_empty() {
        return None;
    }

    let split_operator = token
        .split_once(':')
        .map(|(operator, value)| (operator.to_lowercase(), value));
    let (scope, case_sensitive, value) = match split_operator.as_ref() {
        Some((operator, value)) if operator == "file" => {
            (WorkspaceSearchScope::File, default_case_sensitive, *value)
        }
        Some((operator, value)) if operator == "path" => {
            (WorkspaceSearchScope::Path, default_case_sensitive, *value)
        }
        Some((operator, value)) if operator == "content" => (
            WorkspaceSearchScope::Content,
            default_case_sensitive,
            *value,
        ),
        Some((operator, value)) if operator == "match-case" => {
            (WorkspaceSearchScope::Content, true, *value)
        }
        Some((operator, value)) if operator == "ignore-case" => {
            (WorkspaceSearchScope::Content, false, *value)
        }
        _ => (WorkspaceSearchScope::Content, default_case_sensitive, token),
    };
    if value.is_empty() {
        return None;
    }

    Some(WorkspaceSearchParsedToken {
        excluded,
        term: WorkspaceSearchQueryTerm {
            matcher: workspace_search_text_matcher(value, case_sensitive),
            scope,
        },
    })
}

fn workspace_search_text_matcher(query: &str, case_sensitive: bool) -> WorkspaceSearchTextMatcher {
    let strategy = if case_sensitive {
        WorkspaceSearchMatchStrategy::Exact
    } else if query.is_ascii() {
        WorkspaceSearchMatchStrategy::AsciiCaseInsensitive
    } else {
        WorkspaceSearchMatchStrategy::UnicodeCaseInsensitive
    };
    let normalized_query = match strategy {
        WorkspaceSearchMatchStrategy::Exact => None,
        WorkspaceSearchMatchStrategy::AsciiCaseInsensitive => Some(query.to_ascii_lowercase()),
        WorkspaceSearchMatchStrategy::UnicodeCaseInsensitive => Some(query.to_lowercase()),
    };

    WorkspaceSearchTextMatcher {
        query: query.to_string(),
        strategy,
        normalized_query,
        query_char_count: query.chars().count(),
    }
}

fn workspace_search_hash_hex(input: impl AsRef<[u8]>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    format!("{:x}", hasher.finalize())
}

fn workspace_search_index_store_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("workspace-search-indexes"))
        .map_err(|error| error.to_string())
}

fn workspace_search_index_path(index_store_root: &Path, root: &Path) -> PathBuf {
    let root_key = root.to_string_lossy();

    index_store_root.join(format!(
        "{}.json",
        workspace_search_hash_hex(root_key.as_bytes())
    ))
}

fn persisted_signature_from_signature(
    signature: &WorkspaceSearchFileSignature,
) -> PersistedWorkspaceSearchFileSignature {
    PersistedWorkspaceSearchFileSignature {
        modified_at: signature.modified_at.map(|value| value.to_string()),
        size_bytes: signature.size_bytes,
    }
}

fn signature_from_persisted_signature(
    signature: &PersistedWorkspaceSearchFileSignature,
) -> Option<WorkspaceSearchFileSignature> {
    Some(WorkspaceSearchFileSignature {
        modified_at: signature
            .modified_at
            .as_deref()
            .map(str::parse::<u128>)
            .transpose()
            .ok()?,
        size_bytes: signature.size_bytes,
    })
}

fn load_persisted_workspace_search_index(
    index_path: &Path,
    root: &str,
) -> Result<HashMap<String, WorkspaceSearchIndexedFile>, String> {
    if !index_path.exists() {
        return Ok(HashMap::new());
    }

    let persisted = serde_json::from_str::<PersistedWorkspaceSearchIndex>(
        &fs::read_to_string(index_path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;

    if persisted.version != WORKSPACE_SEARCH_INDEX_FORMAT_VERSION || persisted.root != root {
        return Ok(HashMap::new());
    }

    Ok(persisted
        .files
        .into_iter()
        .filter_map(|file| {
            let signature = signature_from_persisted_signature(&file.signature)?;
            Some((
                file.path.clone(),
                WorkspaceSearchIndexedFile {
                    file: MarkdownFolderFile {
                        created_at: file.created_at,
                        kind: MarkdownFolderEntryKind::File,
                        modified_at: file.modified_at,
                        path: file.path,
                        relative_path: file.relative_path,
                    },
                    signature: Some(signature),
                    content: Some(Arc::new(WorkspaceSearchIndexedContent::new(file.text))),
                },
            ))
        })
        .collect())
}

fn save_persisted_workspace_search_index(
    index_path: &Path,
    root: &str,
    index: &WorkspaceSearchIndex,
) -> Result<(), String> {
    let files = index
        .files
        .iter()
        .filter_map(|file| {
            let signature = file.signature.as_ref()?;
            let content = file.content.as_ref()?;

            Some(PersistedWorkspaceSearchIndexedFile {
                created_at: file.file.created_at,
                modified_at: file.file.modified_at,
                path: file.file.path.clone(),
                relative_path: file.file.relative_path.clone(),
                signature: persisted_signature_from_signature(signature),
                text: content.text.clone(),
            })
        })
        .collect();
    let persisted = PersistedWorkspaceSearchIndex {
        version: WORKSPACE_SEARCH_INDEX_FORMAT_VERSION,
        root: root.to_string(),
        files,
    };
    let parent = index_path
        .parent()
        .ok_or_else(|| "Workspace search index path is invalid".to_string())?;
    let temp_path = index_path.with_extension("json.tmp");

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    fs::write(
        &temp_path,
        serde_json::to_vec(&persisted).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&temp_path, index_path).map_err(|error| error.to_string())
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
    signature_for_file: impl FnMut(&MarkdownFolderFile) -> Result<WorkspaceSearchFileSignature, String>,
    read_file: impl FnMut(&MarkdownFolderFile) -> Result<String, String>,
) -> Result<(), String> {
    refresh_workspace_search_index_files_with_persistence(
        index,
        files,
        None,
        "",
        signature_for_file,
        read_file,
    )
}

fn refresh_workspace_search_index_files_with_persistence(
    index: &mut WorkspaceSearchIndex,
    files: Vec<MarkdownFolderFile>,
    persistence_path: Option<&Path>,
    persistence_root: &str,
    mut signature_for_file: impl FnMut(
        &MarkdownFolderFile,
    ) -> Result<WorkspaceSearchFileSignature, String>,
    mut read_file: impl FnMut(&MarkdownFolderFile) -> Result<String, String>,
) -> Result<(), String> {
    let mut cached_files = std::mem::take(&mut index.files)
        .into_iter()
        .map(|file| (file.file.path.clone(), file))
        .collect::<HashMap<_, _>>();
    let mut persistence_dirty = persistence_path.is_some_and(|path| !path.exists());
    let mut persisted_files = match persistence_path {
        Some(path) => match load_persisted_workspace_search_index(path, persistence_root) {
            Ok(files) => files,
            Err(_) => {
                persistence_dirty = true;
                HashMap::new()
            }
        },
        None => HashMap::new(),
    };
    let mut indexed_files = Vec::with_capacity(files.len());

    for file in files {
        let cached_file = cached_files.remove(&file.path);
        let persisted_file = persisted_files.remove(&file.path);
        let Ok(signature) = signature_for_file(&file) else {
            if cached_file.is_some() || persisted_file.is_some() {
                persistence_dirty = true;
            }
            indexed_files.push(WorkspaceSearchIndexedFile {
                file,
                signature: None,
                content: None,
            });
            continue;
        };

        if let Some(cached_file) = cached_file.filter(|cached_file| {
            cached_file.signature.as_ref() == Some(&signature) && cached_file.content.is_some()
        }) {
            if !persisted_file.as_ref().is_some_and(|persisted_file| {
                persisted_file.signature.as_ref() == Some(&signature)
                    && persisted_file.content.is_some()
            }) {
                persistence_dirty = true;
            }
            indexed_files.push(WorkspaceSearchIndexedFile {
                file,
                signature: Some(signature),
                content: cached_file.content,
            });
            continue;
        }

        if let Some(persisted_file) = persisted_file.filter(|persisted_file| {
            persisted_file.signature.as_ref() == Some(&signature)
                && persisted_file.content.is_some()
        }) {
            indexed_files.push(WorkspaceSearchIndexedFile {
                file,
                signature: Some(signature),
                content: persisted_file.content,
            });
            continue;
        }

        persistence_dirty = true;
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

    if !persisted_files.is_empty() {
        persistence_dirty = true;
    }

    index.files = indexed_files;
    if let Some(persistence_path) = persistence_path.filter(|_| persistence_dirty) {
        save_persisted_workspace_search_index(persistence_path, persistence_root, index)?;
    }

    Ok(())
}

fn indexed_workspace_files_for_search(
    root: &Path,
    files: Vec<MarkdownFolderFile>,
    index_store_root: Option<&Path>,
) -> Result<Vec<WorkspaceSearchIndexedFile>, String> {
    let cache = WORKSPACE_SEARCH_INDEX_CACHE
        .get_or_init(|| Mutex::new(WorkspaceSearchIndexCache::default()));
    let mut cache = cache.lock().map_err(|error| error.to_string())?;
    let index = cache.indexes.entry(root.to_path_buf()).or_default();
    let persistence_path = index_store_root
        .map(|index_store_root| workspace_search_index_path(index_store_root, root));
    let persistence_root = root.to_string_lossy().to_string();

    refresh_workspace_search_index_files_with_persistence(
        index,
        files,
        persistence_path.as_deref(),
        &persistence_root,
        workspace_search_file_signature,
        read_workspace_search_file,
    )?;

    Ok(index.files.clone())
}

fn markdown_search_ranges(
    text: &str,
    ascii_lowercase_text: Option<&str>,
    matcher: &WorkspaceSearchTextMatcher,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    #[cfg(test)]
    WORKSPACE_SEARCH_RANGE_SCAN_COUNT.with(|count| count.set(count.get() + 1));

    if max_matches == Some(0) {
        return Vec::new();
    }

    match matcher.strategy {
        WorkspaceSearchMatchStrategy::Exact => {
            markdown_search_ranges_exact(text, &matcher.query, max_matches)
        }
        WorkspaceSearchMatchStrategy::AsciiCaseInsensitive => {
            let normalized_query = matcher
                .normalized_query
                .as_deref()
                .unwrap_or(&matcher.query);

            if let Some(normalized_text) = ascii_lowercase_text {
                return markdown_search_ranges_ascii_case_insensitive_normalized(
                    normalized_text,
                    normalized_query,
                    matcher.query.len(),
                    max_matches,
                );
            }

            if text.is_ascii() {
                return markdown_search_ranges_ascii_case_insensitive(
                    text,
                    normalized_query,
                    matcher.query.len(),
                    max_matches,
                );
            }

            markdown_search_ranges_unicode_case_insensitive(
                text,
                normalized_query,
                matcher.query_char_count,
                max_matches,
            )
        }
        WorkspaceSearchMatchStrategy::UnicodeCaseInsensitive => {
            let normalized_query = matcher
                .normalized_query
                .as_deref()
                .unwrap_or(&matcher.query);

            markdown_search_ranges_unicode_case_insensitive(
                text,
                normalized_query,
                matcher.query_char_count,
                max_matches,
            )
        }
    }
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
    normalized_query: &str,
    query_length: usize,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    let normalized_text = text.to_ascii_lowercase();

    markdown_search_ranges_ascii_case_insensitive_normalized(
        &normalized_text,
        normalized_query,
        query_length,
        max_matches,
    )
}

fn markdown_search_ranges_ascii_case_insensitive_normalized(
    normalized_text: &str,
    normalized_query: &str,
    query_length: usize,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    normalized_text
        .match_indices(normalized_query)
        .take(max_matches.unwrap_or(usize::MAX))
        .map(|(from, _)| MarkdownSearchRange {
            from,
            to: from + query_length,
        })
        .collect()
}

fn markdown_search_ranges_unicode_case_insensitive(
    text: &str,
    normalized_query: &str,
    query_char_count: usize,
    max_matches: Option<usize>,
) -> Vec<MarkdownSearchRange> {
    if query_char_count == 0 {
        return Vec::new();
    }

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

        if candidate.to_lowercase() == normalized_query {
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

struct WorkspaceSearchMatchedRange {
    field_text: Option<String>,
    range: MarkdownSearchRange,
}

enum WorkspaceSearchGroupFileState {
    FileOnly,
    NeedsContent,
    NoMatch,
}

enum WorkspaceSearchFilePlanState<'a> {
    FileOnly(&'a WorkspaceSearchQueryGroup),
    NeedsContent,
    NoMatch,
}

fn workspace_search_file_plan_state<'a>(
    file: &MarkdownFolderFile,
    query_plan: &'a WorkspaceSearchQueryPlan,
) -> WorkspaceSearchFilePlanState<'a> {
    let mut needs_content = false;

    for group in &query_plan.groups {
        match workspace_search_group_file_state(file, group) {
            WorkspaceSearchGroupFileState::FileOnly => {
                return WorkspaceSearchFilePlanState::FileOnly(group);
            }
            WorkspaceSearchGroupFileState::NeedsContent => needs_content = true,
            WorkspaceSearchGroupFileState::NoMatch => {}
        }
    }

    if needs_content {
        WorkspaceSearchFilePlanState::NeedsContent
    } else {
        WorkspaceSearchFilePlanState::NoMatch
    }
}

fn workspace_search_group_file_state(
    file: &MarkdownFolderFile,
    group: &WorkspaceSearchQueryGroup,
) -> WorkspaceSearchGroupFileState {
    if !group
        .include
        .iter()
        .filter(|term| term.scope != WorkspaceSearchScope::Content)
        .all(|term| workspace_search_term_matches_file(file, term))
    {
        return WorkspaceSearchGroupFileState::NoMatch;
    }

    if group
        .exclude
        .iter()
        .filter(|term| term.scope != WorkspaceSearchScope::Content)
        .any(|term| workspace_search_term_matches_file(file, term))
    {
        return WorkspaceSearchGroupFileState::NoMatch;
    }

    let needs_content = group
        .include
        .iter()
        .chain(group.exclude.iter())
        .any(|term| term.scope == WorkspaceSearchScope::Content);

    if needs_content {
        WorkspaceSearchGroupFileState::NeedsContent
    } else {
        WorkspaceSearchGroupFileState::FileOnly
    }
}

fn workspace_search_term_matches_file(
    file: &MarkdownFolderFile,
    term: &WorkspaceSearchQueryTerm,
) -> bool {
    !markdown_search_ranges(
        &workspace_search_file_field_value(file, term.scope),
        None,
        &term.matcher,
        Some(1),
    )
    .is_empty()
}

fn workspace_search_file_field_value(
    file: &MarkdownFolderFile,
    scope: WorkspaceSearchScope,
) -> String {
    if scope == WorkspaceSearchScope::File {
        return Path::new(&file.relative_path)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| file.relative_path.clone());
    }

    file.relative_path.clone()
}

fn workspace_search_file_only_matched_range(
    file: &MarkdownFolderFile,
    group: &WorkspaceSearchQueryGroup,
) -> WorkspaceSearchMatchedRange {
    let term = group
        .include
        .iter()
        .find(|term| term.scope != WorkspaceSearchScope::Content);
    let field_text = term
        .map(|term| workspace_search_file_field_value(file, term.scope))
        .unwrap_or_else(|| file.relative_path.clone());
    let range = term
        .and_then(|term| {
            markdown_search_ranges(&field_text, None, &term.matcher, Some(1))
                .into_iter()
                .next()
        })
        .unwrap_or_else(|| MarkdownSearchRange {
            from: 0,
            to: field_text.len(),
        });

    WorkspaceSearchMatchedRange {
        field_text: Some(field_text),
        range,
    }
}

fn workspace_search_matched_ranges(
    file: &MarkdownFolderFile,
    content: &str,
    ascii_lowercase_content: Option<&str>,
    query_plan: &WorkspaceSearchQueryPlan,
    max_matches: Option<usize>,
) -> Vec<WorkspaceSearchMatchedRange> {
    let mut ranges = Vec::new();
    let mut seen_content_ranges = HashSet::new();

    for group in &query_plan.groups {
        if !group
            .include
            .iter()
            .filter(|term| term.scope != WorkspaceSearchScope::Content)
            .all(|term| workspace_search_term_matches_file(file, term))
        {
            continue;
        }

        if group
            .exclude
            .iter()
            .filter(|term| term.scope != WorkspaceSearchScope::Content)
            .any(|term| workspace_search_term_matches_file(file, term))
        {
            continue;
        }

        if group
            .exclude
            .iter()
            .filter(|term| term.scope == WorkspaceSearchScope::Content)
            .any(|term| {
                !markdown_search_ranges(content, ascii_lowercase_content, &term.matcher, Some(1))
                    .is_empty()
            })
        {
            continue;
        }

        let content_terms = group
            .include
            .iter()
            .filter(|term| term.scope == WorkspaceSearchScope::Content)
            .collect::<Vec<_>>();
        if content_terms.is_empty() {
            ranges.push(workspace_search_file_only_matched_range(file, group));
            continue;
        }

        let mut group_ranges = Vec::new();
        let mut group_seen_content_ranges = HashSet::new();
        let mut group_matches_all_content_terms = true;
        for term in content_terms {
            let term_ranges = markdown_search_ranges(
                content,
                ascii_lowercase_content,
                &term.matcher,
                max_matches,
            );
            if term_ranges.is_empty() {
                group_matches_all_content_terms = false;
                break;
            }

            for range in term_ranges {
                if !group_seen_content_ranges.insert((range.from, range.to)) {
                    continue;
                }

                group_ranges.push(WorkspaceSearchMatchedRange {
                    field_text: None,
                    range,
                });
            }
        }

        if group_matches_all_content_terms {
            for range in group_ranges {
                if !seen_content_ranges.insert((range.range.from, range.range.to)) {
                    continue;
                }

                ranges.push(range);
            }
        }
    }

    ranges.sort_by_key(|matched_range| (matched_range.range.from, matched_range.range.to));
    if let Some(max_matches) = max_matches {
        ranges.truncate(max_matches);
    }

    ranges
}

fn markdown_workspace_search_results(
    file: &MarkdownFolderFile,
    content: &str,
    ascii_lowercase_content: Option<&str>,
    query_plan: &WorkspaceSearchQueryPlan,
    max_matches_per_file: Option<usize>,
) -> (Vec<MarkdownWorkspaceSearchResult>, bool) {
    let search_limit = max_matches_per_file.map(|limit| limit.saturating_add(1));
    let mut ranges = workspace_search_matched_ranges(
        file,
        content,
        ascii_lowercase_content,
        query_plan,
        search_limit,
    );
    let truncated = max_matches_per_file.is_some_and(|limit| ranges.len() > limit);
    if let Some(max_matches_per_file) = max_matches_per_file {
        ranges.truncate(max_matches_per_file);
    }

    let results = ranges
        .into_iter()
        .enumerate()
        .map(|(match_index, matched_range)| {
            let source_text = matched_range.field_text.as_deref().unwrap_or(content);
            let (line_number, column_number, line_text) =
                markdown_search_line(source_text, &matched_range.range);
            let match_length = source_text[matched_range.range.from..matched_range.range.to]
                .chars()
                .count();

            MarkdownWorkspaceSearchResult {
                column_number,
                file: file.clone(),
                id: format!("{}:{}", file.path, matched_range.range.from),
                line_number,
                snippet: markdown_search_snippet(&line_text, column_number, match_length),
                line_text,
                matched_range: matched_range.range,
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
    query_plan: &WorkspaceSearchQueryPlan,
    current_document_path: Option<&str>,
    current_document_content: Option<&str>,
    max_matches_per_file: Option<usize>,
) -> MarkdownWorkspaceFileSearchResult {
    match workspace_search_file_plan_state(&indexed_file.file, query_plan) {
        WorkspaceSearchFilePlanState::NoMatch => {
            return MarkdownWorkspaceFileSearchResult {
                file_index,
                matches: Vec::new(),
                truncated: false,
                unreadable: false,
            };
        }
        WorkspaceSearchFilePlanState::FileOnly(group) => {
            let matched_range = workspace_search_file_only_matched_range(&indexed_file.file, group);
            let source_text = matched_range
                .field_text
                .as_deref()
                .unwrap_or(&indexed_file.file.relative_path);
            let (line_number, column_number, line_text) =
                markdown_search_line(source_text, &matched_range.range);
            let match_length = source_text[matched_range.range.from..matched_range.range.to]
                .chars()
                .count();

            return MarkdownWorkspaceFileSearchResult {
                file_index,
                matches: vec![MarkdownWorkspaceSearchResult {
                    column_number,
                    file: indexed_file.file.clone(),
                    id: format!("{}:{}", indexed_file.file.path, matched_range.range.from),
                    line_number,
                    snippet: markdown_search_snippet(&line_text, column_number, match_length),
                    line_text,
                    matched_range: matched_range.range,
                    match_index: 0,
                }],
                truncated: false,
                unreadable: false,
            };
        }
        WorkspaceSearchFilePlanState::NeedsContent => {}
    }

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
        query_plan,
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
    query_plan: &WorkspaceSearchQueryPlan,
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
                    query_plan,
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
                            query_plan,
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
    search_markdown_files_for_path_blocking_with_index_store(
        path,
        query,
        case_sensitive,
        current_document_path,
        current_document_content,
        max_matches,
        max_matches_per_file,
        None,
    )
}

fn search_markdown_files_for_path_blocking_with_index_store(
    path: String,
    query: String,
    case_sensitive: bool,
    current_document_path: Option<String>,
    current_document_content: Option<String>,
    max_matches: Option<usize>,
    max_matches_per_file: Option<usize>,
    index_store_root: Option<PathBuf>,
) -> Result<MarkdownWorkspaceSearchResponse, String> {
    let query_plan = plan_workspace_search_query(&query, case_sensitive);
    let source_path = PathBuf::from(path);
    let root = markdown_tree_root_for_path(&source_path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let files = collect_markdown_workspace_files(&root)?;
    if query_plan.is_none() || max_matches == Some(0) || max_matches_per_file == Some(0) {
        return Ok(MarkdownWorkspaceSearchResponse {
            results: Vec::new(),
            searched_file_count: files.len(),
            truncated: false,
            unreadable_file_count: 0,
        });
    }

    let query_plan = query_plan.expect("query plan should exist after empty query guard");
    let searched_file_count = files.len();
    let indexed_files =
        indexed_workspace_files_for_search(&root, files, index_store_root.as_deref())?;
    let mut results = Vec::new();
    let mut unreadable_file_count = 0;
    let mut truncated = false;
    let file_results = search_markdown_workspace_files(
        &indexed_files,
        &query_plan,
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
    app: tauri::AppHandle,
    path: String,
    query: String,
    case_sensitive: bool,
    current_document_path: Option<String>,
    current_document_content: Option<String>,
    max_matches: Option<usize>,
    max_matches_per_file: Option<usize>,
) -> Result<MarkdownWorkspaceSearchResponse, String> {
    let index_store_root = workspace_search_index_store_root(&app).ok();

    tauri::async_runtime::spawn_blocking(move || {
        search_markdown_files_for_path_blocking_with_index_store(
            path,
            query,
            case_sensitive,
            current_document_path,
            current_document_content,
            max_matches,
            max_matches_per_file,
            index_store_root,
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
    fn searches_workspace_files_with_field_filters_and_exclusions() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-query-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let docs = root.join("docs");

        fs::create_dir_all(&docs).expect("docs folder should be created");
        fs::write(root.join("guide.md"), "alpha guide").expect("guide file should be created");
        fs::write(docs.join("release.md"), "alpha release note")
            .expect("release file should be created");
        fs::write(docs.join("draft.md"), "alpha draft note").expect("draft file should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "path:docs alpha -draft".to_string(),
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
            vec!["docs/release.md"]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn searches_workspace_files_with_file_only_query_terms() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-file-query-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("guide.md"), "# Guide title").expect("guide file should be created");
        fs::write(root.join("release.md"), "# Release title")
            .expect("release file should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "file:guide OR file:release".to_string(),
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
                .map(|result| (
                    result.file.relative_path.as_str(),
                    result.line_number,
                    result.line_text.as_str(),
                    result.snippet.as_str()
                ))
                .collect::<Vec<_>>(),
            vec![
                ("guide.md", 1, "guide.md", "guide.md"),
                ("release.md", 1, "release.md", "release.md")
            ]
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[test]
    fn searches_unknown_colon_tokens_as_plain_content() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-colon-query-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));

        fs::create_dir_all(&root).expect("test folder should be created");
        fs::write(root.join("guide.md"), "visit https://example.test/docs")
            .expect("guide file should be created");

        let search = search_markdown_files_for_path_blocking(
            root.to_string_lossy().to_string(),
            "https://example.test".to_string(),
            false,
            None,
            None,
            Some(10),
            Some(5),
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 1);
        assert_eq!(
            search.results[0].line_text,
            "visit https://example.test/docs"
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
        };
        let second = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: Some(1),
            path: "/synthetic/second.md".to_string(),
            relative_path: "second.md".to_string(),
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
    fn plans_workspace_search_query_once() {
        let exact = plan_workspace_search_query(" Alpha ", true)
            .expect("case-sensitive query should be planned");
        assert_eq!(exact.query, "Alpha");
        assert_eq!(exact.groups.len(), 1);
        assert_eq!(exact.groups[0].include.len(), 1);
        assert_eq!(
            exact.groups[0].include[0].scope,
            WorkspaceSearchScope::Content
        );
        assert_eq!(exact.groups[0].include[0].matcher.query, "Alpha");
        assert_eq!(
            exact.groups[0].include[0].matcher.strategy,
            WorkspaceSearchMatchStrategy::Exact
        );
        assert_eq!(
            exact.groups[0].include[0]
                .matcher
                .normalized_query
                .as_deref(),
            None
        );
        assert_eq!(exact.groups[0].include[0].matcher.query_char_count, 5);

        let ascii =
            plan_workspace_search_query(" Alpha ", false).expect("ASCII query should be planned");
        assert_eq!(ascii.query, "Alpha");
        assert_eq!(
            ascii.groups[0].include[0].matcher.strategy,
            WorkspaceSearchMatchStrategy::AsciiCaseInsensitive
        );
        assert_eq!(
            ascii.groups[0].include[0]
                .matcher
                .normalized_query
                .as_deref(),
            Some("alpha")
        );
        assert_eq!(ascii.groups[0].include[0].matcher.query_char_count, 5);

        let unicode =
            plan_workspace_search_query(" Älpha ", false).expect("Unicode query should be planned");
        assert_eq!(
            unicode.groups[0].include[0].matcher.strategy,
            WorkspaceSearchMatchStrategy::UnicodeCaseInsensitive
        );
        assert_eq!(
            unicode.groups[0].include[0]
                .matcher
                .normalized_query
                .as_deref(),
            Some("älpha")
        );
        assert_eq!(unicode.groups[0].include[0].matcher.query_char_count, 5);

        let structured = plan_workspace_search_query(
            "file:guide path:docs content:Alpha -draft OR match-case:Beta",
            false,
        )
        .expect("structured query should be planned");
        assert_eq!(structured.groups.len(), 2);
        assert_eq!(
            structured.groups[0]
                .include
                .iter()
                .map(|term| (term.scope, term.matcher.query.as_str()))
                .collect::<Vec<_>>(),
            vec![
                (WorkspaceSearchScope::File, "guide"),
                (WorkspaceSearchScope::Path, "docs"),
                (WorkspaceSearchScope::Content, "Alpha"),
            ]
        );
        assert_eq!(
            structured.groups[0].exclude[0].scope,
            WorkspaceSearchScope::Content
        );
        assert_eq!(structured.groups[0].exclude[0].matcher.query, "draft");
        assert_eq!(
            structured.groups[1].include[0].matcher.strategy,
            WorkspaceSearchMatchStrategy::Exact
        );

        let unknown_operator = plan_workspace_search_query("https://example.test", false)
            .expect("unknown operator-looking query should be planned");
        assert_eq!(
            unknown_operator.groups[0].include[0].matcher.query,
            "https://example.test"
        );
        assert_eq!(
            unknown_operator.groups[0].include[0].scope,
            WorkspaceSearchScope::Content
        );

        assert!(plan_workspace_search_query("   ", false).is_none());
    }

    #[test]
    fn collects_simple_content_query_matches_with_one_content_scan() {
        let file = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: None,
            path: "/synthetic/note.md".to_string(),
            relative_path: "note.md".to_string(),
        };
        let query_plan =
            plan_workspace_search_query("alpha", false).expect("query should be planned");

        WORKSPACE_SEARCH_RANGE_SCAN_COUNT.with(|count| count.set(0));
        let (results, truncated) = markdown_workspace_search_results(
            &file,
            "alpha\nbeta\nalpha",
            Some("alpha\nbeta\nalpha"),
            &query_plan,
            None,
        );

        assert_eq!(results.len(), 2);
        assert_eq!(truncated, false);
        WORKSPACE_SEARCH_RANGE_SCAN_COUNT.with(|count| assert_eq!(count.get(), 1));
    }

    #[test]
    fn persists_workspace_search_index_between_index_instances() {
        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-persist-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let store = root.join("search-cache");
        let index_path = store.join("index.json");
        let first = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: Some(1),
            path: "/synthetic/first.md".to_string(),
            relative_path: "first.md".to_string(),
        };
        let signature = WorkspaceSearchFileSignature {
            modified_at: Some(1),
            size_bytes: 10,
        };
        let mut first_index = WorkspaceSearchIndex::default();
        let mut first_read_count = 0;

        refresh_workspace_search_index_files_with_persistence(
            &mut first_index,
            vec![first.clone()],
            Some(&index_path),
            "synthetic-root",
            |_| Ok(signature.clone()),
            |_| {
                first_read_count += 1;
                Ok("Alpha from disk".to_string())
            },
        )
        .expect("index should refresh and persist");

        assert_eq!(first_read_count, 1);
        assert!(index_path.exists());

        let mut restarted_index = WorkspaceSearchIndex::default();
        let mut restarted_read_count = 0;
        refresh_workspace_search_index_files_with_persistence(
            &mut restarted_index,
            vec![first],
            Some(&index_path),
            "synthetic-root",
            |_| Ok(signature.clone()),
            |_| {
                restarted_read_count += 1;
                Ok("Should not be read".to_string())
            },
        )
        .expect("persisted index should refresh");

        assert_eq!(restarted_read_count, 0);
        assert_eq!(
            restarted_index.files[0]
                .content
                .as_ref()
                .map(|content| content.text.as_str()),
            Some("Alpha from disk")
        );

        let changed_signature = WorkspaceSearchFileSignature {
            modified_at: Some(2),
            size_bytes: 11,
        };
        let mut changed_index = WorkspaceSearchIndex::default();
        let mut changed_read_count = 0;
        refresh_workspace_search_index_files_with_persistence(
            &mut changed_index,
            vec![MarkdownFolderFile {
                created_at: None,
                kind: MarkdownFolderEntryKind::File,
                modified_at: Some(2),
                path: "/synthetic/first.md".to_string(),
                relative_path: "first.md".to_string(),
            }],
            Some(&index_path),
            "synthetic-root",
            |_| Ok(changed_signature.clone()),
            |_| {
                changed_read_count += 1;
                Ok("Beta from disk".to_string())
            },
        )
        .expect("changed persisted index should refresh");

        assert_eq!(changed_read_count, 1);
        assert_eq!(
            changed_index.files[0]
                .content
                .as_ref()
                .map(|content| content.text.as_str()),
            Some("Beta from disk")
        );

        fs::remove_dir_all(root).expect("test tree should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn skips_persisted_workspace_search_save_when_index_is_unchanged() {
        use std::os::unix::fs::PermissionsExt;

        let root = std::env::temp_dir().join(format!(
            "markra-workspace-search-persist-skip-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after epoch")
                .as_nanos()
        ));
        let index_path = root.join("search-cache").join("index.json");
        let first = MarkdownFolderFile {
            created_at: None,
            kind: MarkdownFolderEntryKind::File,
            modified_at: Some(1),
            path: "/synthetic/first.md".to_string(),
            relative_path: "first.md".to_string(),
        };
        let signature = WorkspaceSearchFileSignature {
            modified_at: Some(1),
            size_bytes: 10,
        };
        let mut first_index = WorkspaceSearchIndex::default();

        refresh_workspace_search_index_files_with_persistence(
            &mut first_index,
            vec![first.clone()],
            Some(&index_path),
            "synthetic-root",
            |_| Ok(signature.clone()),
            |_| Ok("Alpha from disk".to_string()),
        )
        .expect("index should refresh and persist");

        let index_directory = index_path
            .parent()
            .expect("index path should have a parent")
            .to_path_buf();
        let mut readonly_permissions = fs::metadata(&index_directory)
            .expect("index directory metadata should be readable")
            .permissions();
        readonly_permissions.set_mode(0o500);
        fs::set_permissions(&index_directory, readonly_permissions)
            .expect("index directory should become read-only");

        let mut restarted_index = WorkspaceSearchIndex::default();
        let mut read_count = 0;
        let refresh = refresh_workspace_search_index_files_with_persistence(
            &mut restarted_index,
            vec![first],
            Some(&index_path),
            "synthetic-root",
            |_| Ok(signature.clone()),
            |_| {
                read_count += 1;
                Ok("Should not be read".to_string())
            },
        );

        let mut writable_permissions = fs::metadata(&index_directory)
            .expect("index directory metadata should still be readable")
            .permissions();
        writable_permissions.set_mode(0o700);
        fs::set_permissions(&index_directory, writable_permissions)
            .expect("index directory should become writable again");

        refresh.expect("unchanged persisted index should not be rewritten");
        assert_eq!(read_count, 0);

        fs::remove_dir_all(root).expect("test tree should be removed");
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
        )
        .expect("workspace search should complete");

        assert_eq!(search.results.len(), 1);
        assert_eq!(search.results[0].line_text, "alpha from disk");

        fs::remove_dir_all(root).expect("test tree should be removed");
    }
}
