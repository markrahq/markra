mod de;
mod en;
mod es;
mod fr;
mod it;
mod ja;
mod ko;
mod pt_br;
mod ru;
mod zh_cn;
mod zh_tw;

use crate::language::AppLanguage;

#[derive(Clone, Copy)]
pub(crate) struct MenuLabels {
    pub(crate) file: &'static str,
    pub(crate) edit: &'static str,
    pub(crate) format: &'static str,
    pub(crate) view: &'static str,
    pub(crate) new_document: &'static str,
    pub(crate) open_document: &'static str,
    pub(crate) open_recent_file: &'static str,
    pub(crate) no_recent_files: &'static str,
    pub(crate) clear_recent_files: &'static str,
    pub(crate) open_folder: &'static str,
    pub(crate) quick_open: &'static str,
    pub(crate) close_document: &'static str,
    pub(crate) save_document: &'static str,
    pub(crate) save_document_as: &'static str,
    pub(crate) export: &'static str,
    pub(crate) export_pdf: &'static str,
    pub(crate) export_html: &'static str,
    pub(crate) export_docx: &'static str,
    pub(crate) export_epub: &'static str,
    pub(crate) export_latex: &'static str,
    pub(crate) settings: &'static str,
    pub(crate) check_updates: &'static str,
    pub(crate) undo: &'static str,
    pub(crate) redo: &'static str,
    pub(crate) cut: &'static str,
    pub(crate) copy: &'static str,
    pub(crate) paste: &'static str,
    pub(crate) select_all: &'static str,
    pub(crate) hide: &'static str,
    pub(crate) hide_others: &'static str,
    pub(crate) show_all: &'static str,
    pub(crate) quit: &'static str,
    pub(crate) fullscreen: &'static str,
    pub(crate) toggle_file_list: &'static str,
    pub(crate) toggle_markra_ai: &'static str,
    pub(crate) ai_writing_command: &'static str,
    pub(crate) toggle_all_folds: &'static str,
    pub(crate) toggle_read_only_mode: &'static str,
    pub(crate) toggle_source_mode: &'static str,
    pub(crate) bold: &'static str,
    pub(crate) italic: &'static str,
    pub(crate) strikethrough: &'static str,
    pub(crate) inline_code: &'static str,
    pub(crate) paragraph: &'static str,
    pub(crate) heading_1: &'static str,
    pub(crate) heading_2: &'static str,
    pub(crate) heading_3: &'static str,
    pub(crate) bullet_list: &'static str,
    pub(crate) ordered_list: &'static str,
    pub(crate) quote: &'static str,
    pub(crate) code_block: &'static str,
    pub(crate) link: &'static str,
    pub(crate) image: &'static str,
    pub(crate) import_local_images: &'static str,
    pub(crate) table: &'static str,
}

pub(crate) fn for_language(language: AppLanguage) -> MenuLabels {
    match language {
        AppLanguage::En => en::LABELS,
        AppLanguage::ZhCn => zh_cn::LABELS,
        AppLanguage::ZhTw => zh_tw::LABELS,
        AppLanguage::Ja => ja::LABELS,
        AppLanguage::Ko => ko::LABELS,
        AppLanguage::Fr => fr::LABELS,
        AppLanguage::De => de::LABELS,
        AppLanguage::Es => es::LABELS,
        AppLanguage::PtBr => pt_br::LABELS,
        AppLanguage::It => it::LABELS,
        AppLanguage::Ru => ru::LABELS,
    }
}
