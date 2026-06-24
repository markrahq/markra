#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFile {
    pub(crate) path: String,
    pub(crate) contents: String,
    pub(crate) size_bytes: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFileHistoryEntry {
    pub(crate) id: String,
    pub(crate) created_at: u64,
    pub(crate) size_bytes: u64,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFileHistoryFile {
    pub(crate) id: String,
    pub(crate) contents: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub(crate) struct MarkdownTemplateFile {
    pub(crate) contents: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum PandocExportFormat {
    Docx,
    Epub,
    Latex,
}

impl PandocExportFormat {
    pub(crate) fn extension(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Epub => "epub",
            Self::Latex => "tex",
        }
    }

    pub(crate) fn pandoc_writer(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Epub => "epub",
            Self::Latex => "latex",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MarkdownFolderEntryKind {
    Asset,
    Attachment,
    File,
    Folder,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownFolderFile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) created_at: Option<u64>,
    pub(crate) kind: MarkdownFolderEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) modified_at: Option<u64>,
    pub(crate) path: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardImageFile {
    pub(crate) relative_path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClipboardAttachmentFile {
    pub(crate) relative_path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownImageFile {
    pub(crate) bytes: Vec<u8>,
    pub(crate) mime_type: String,
    pub(crate) path: String,
}

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum MarkdownOpenPath {
    File { path: String },
    Folder { path: String },
}
