use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde_json::{Map, Value};

const LANGUAGE_KEY: &str = "language";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AppLanguage {
    En,
    ZhCn,
    ZhTw,
    Ja,
    Ko,
    Fr,
    De,
    Es,
    PtBr,
    It,
    Ru,
}

impl AppLanguage {
    pub(crate) fn as_code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::ZhCn => "zh-CN",
            Self::ZhTw => "zh-TW",
            Self::Ja => "ja",
            Self::Ko => "ko",
            Self::Fr => "fr",
            Self::De => "de",
            Self::Es => "es",
            Self::PtBr => "pt-BR",
            Self::It => "it",
            Self::Ru => "ru",
        }
    }

    pub(crate) fn from_code(value: &str) -> Option<Self> {
        match value {
            "en" => Some(Self::En),
            "zh-CN" => Some(Self::ZhCn),
            "zh-TW" => Some(Self::ZhTw),
            "ja" => Some(Self::Ja),
            "ko" => Some(Self::Ko),
            "fr" => Some(Self::Fr),
            "de" => Some(Self::De),
            "es" => Some(Self::Es),
            "pt-BR" => Some(Self::PtBr),
            "it" => Some(Self::It),
            "ru" => Some(Self::Ru),
            _ => None,
        }
    }
}

pub(crate) fn resolve_startup_language(identifier: &str) -> AppLanguage {
    let system_locales = system_locale_candidates();
    let system_locale_refs = system_locales
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let Some(settings_path) = settings_store_path(identifier) else {
        return language_for_initial_launch(None, &system_locale_refs);
    };

    let stored_language = read_stored_language_code(&settings_path);
    let language = language_for_initial_launch(stored_language.as_deref(), &system_locale_refs);

    if stored_language.as_deref().and_then(AppLanguage::from_code) != Some(language) {
        let _ = save_language_to_settings(&settings_path, language);
    }

    language
}

pub(crate) fn language_for_initial_launch(
    stored_language: Option<&str>,
    system_locales: &[&str],
) -> AppLanguage {
    if let Some(language) = stored_language.and_then(AppLanguage::from_code) {
        return language;
    }

    language_from_system_locales(system_locales).unwrap_or(AppLanguage::En)
}

fn system_locale_candidates() -> Vec<String> {
    sys_locale::get_locales().collect()
}

fn settings_store_path(identifier: &str) -> Option<PathBuf> {
    crate::user_data::settings_store_path(identifier)
}

fn language_from_system_locales(locales: &[&str]) -> Option<AppLanguage> {
    locales
        .iter()
        .find_map(|locale| language_from_locale(locale))
}

fn language_from_locale(locale: &str) -> Option<AppLanguage> {
    let normalized = normalize_locale(locale);

    if normalized.is_empty() {
        return None;
    }

    if normalized == "zh" || normalized.starts_with("zh-") {
        return if normalized.contains("hant")
            || normalized.starts_with("zh-tw")
            || normalized.starts_with("zh-hk")
            || normalized.starts_with("zh-mo")
        {
            Some(AppLanguage::ZhTw)
        } else {
            Some(AppLanguage::ZhCn)
        };
    }

    if normalized == "pt" || normalized.starts_with("pt-") {
        return Some(AppLanguage::PtBr);
    }

    let language = normalized.split('-').next().unwrap_or_default();

    match language {
        "en" => Some(AppLanguage::En),
        "ja" => Some(AppLanguage::Ja),
        "ko" => Some(AppLanguage::Ko),
        "fr" => Some(AppLanguage::Fr),
        "de" => Some(AppLanguage::De),
        "es" => Some(AppLanguage::Es),
        "it" => Some(AppLanguage::It),
        "ru" => Some(AppLanguage::Ru),
        _ => None,
    }
}

fn normalize_locale(locale: &str) -> String {
    locale
        .trim()
        .split(['.', '@'])
        .next()
        .unwrap_or_default()
        .replace('_', "-")
        .to_ascii_lowercase()
}

fn read_stored_language_code(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    let settings = serde_json::from_str::<Value>(&contents).ok()?;

    settings
        .get(LANGUAGE_KEY)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn save_language_to_settings(path: &Path, language: AppLanguage) -> io::Result<()> {
    let mut settings = read_settings_object(path);
    settings.insert(
        LANGUAGE_KEY.to_string(),
        Value::String(language.as_code().to_string()),
    );

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    // Keep this JSON shape aligned with @tauri-apps/plugin-store on the frontend.
    let contents = serde_json::to_string_pretty(&Value::Object(settings))
        .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
    fs::write(path, contents)
}

fn read_settings_object(path: &Path) -> Map<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok())
        .and_then(|settings| settings.as_object().cloned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn stored_language_wins_over_system_locale() {
        let language = language_for_initial_launch(Some("fr"), &["zh_CN"]);

        assert_eq!(language, AppLanguage::Fr);
    }

    #[test]
    fn missing_language_uses_supported_system_locale() {
        let language = language_for_initial_launch(None, &["zh_Hant_TW"]);

        assert_eq!(language, AppLanguage::ZhTw);
    }

    #[test]
    fn unsupported_system_locale_defaults_to_english() {
        let language = language_for_initial_launch(None, &["nl_NL"]);

        assert_eq!(language, AppLanguage::En);
    }

    #[test]
    fn locale_matching_uses_the_first_supported_system_language() {
        let language = language_for_initial_launch(None, &["nl_NL", "ja_JP"]);

        assert_eq!(language, AppLanguage::Ja);
    }

    #[test]
    fn macos_bundle_declares_all_supported_localizations() {
        let expected_localizations = [
            (AppLanguage::En, "en"),
            (AppLanguage::ZhCn, "zh-Hans"),
            (AppLanguage::ZhTw, "zh-Hant"),
            (AppLanguage::Ja, "ja"),
            (AppLanguage::Ko, "ko"),
            (AppLanguage::Fr, "fr"),
            (AppLanguage::De, "de"),
            (AppLanguage::Es, "es"),
            (AppLanguage::PtBr, "pt-BR"),
            (AppLanguage::It, "it"),
            (AppLanguage::Ru, "ru"),
        ];
        let info_plist = include_str!("../Info.plist");
        let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("Tauri config should be valid JSON");
        let bundled_files = config
            .pointer("/bundle/macOS/files")
            .and_then(serde_json::Value::as_object)
            .expect("macOS bundle config should include localized resource files");
        let resources_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("macos-locales");

        for (language, macos_code) in expected_localizations {
            assert!(
                info_plist.contains(&format!("<string>{macos_code}</string>")),
                "Info.plist should declare {} as {macos_code}",
                language.as_code()
            );

            let source = format!("macos-locales/{macos_code}.lproj");
            let destination = format!("Resources/{macos_code}.lproj");
            assert_eq!(
                bundled_files
                    .get(&destination)
                    .and_then(serde_json::Value::as_str),
                Some(source.as_str()),
                "missing bundle resource mapping for {}",
                language.as_code()
            );

            let strings_path = resources_root
                .join(format!("{macos_code}.lproj"))
                .join("InfoPlist.strings");
            let strings = fs::read_to_string(&strings_path)
                .unwrap_or_else(|error| panic!("{}: {error}", strings_path.display()));
            assert!(
                strings.contains("CFBundleDisplayName"),
                "{} should localize the bundle display name",
                strings_path.display()
            );
        }
    }
}
