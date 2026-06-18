use std::collections::BTreeSet;

use serde::Serialize;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemFontFamily {
    family: String,
    label: String,
}

fn normalize_font_family_names(names: impl IntoIterator<Item = String>) -> Vec<String> {
    names
        .into_iter()
        .filter_map(|name| {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                return None;
            }

            Some(trimmed.to_string())
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn normalize_font_family_entry(family: String, label: String) -> Option<SystemFontFamily> {
    let normalized_family = family.trim();
    if normalized_family.is_empty() {
        return None;
    }

    let normalized_label = label.trim();

    Some(SystemFontFamily {
        family: normalized_family.to_string(),
        label: if normalized_label.is_empty() {
            normalized_family.to_string()
        } else {
            normalized_label.to_string()
        },
    })
}

fn normalize_font_family_entries(
    entries: impl IntoIterator<Item = SystemFontFamily>,
) -> Vec<SystemFontFamily> {
    let mut normalized_entries = Vec::new();
    let mut seen_families = BTreeSet::new();

    for entry in entries {
        let Some(normalized_entry) = normalize_font_family_entry(entry.family, entry.label) else {
            continue;
        };

        if seen_families.insert(normalized_entry.family.clone()) {
            normalized_entries.push(normalized_entry);
        }
    }

    normalized_entries.sort_by(|first, second| {
        first
            .label
            .cmp(&second.label)
            .then_with(|| first.family.cmp(&second.family))
    });
    normalized_entries
}

fn fontdb_font_family_names() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    database
        .faces()
        .flat_map(|face| face.families.iter().map(|family| family.0.clone()))
        .collect()
}

fn font_family_entries_from_names(names: Vec<String>) -> Vec<SystemFontFamily> {
    normalize_font_family_names(names)
        .into_iter()
        .map(|family| SystemFontFamily {
            label: family.clone(),
            family,
        })
        .collect()
}

fn system_font_family_entries(
    platform_entries: impl IntoIterator<Item = SystemFontFamily>,
    fallback_names: impl IntoIterator<Item = String>,
) -> Vec<SystemFontFamily> {
    let normalized_platform_entries = normalize_font_family_entries(platform_entries);
    if !normalized_platform_entries.is_empty() {
        return normalized_platform_entries;
    }

    font_family_entries_from_names(fallback_names.into_iter().collect())
}

#[cfg(target_os = "macos")]
fn platform_font_family_entries() -> Vec<SystemFontFamily> {
    use core_foundation::array::{CFArray, CFArrayRef};
    use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
    use core_foundation::string::{CFString, CFStringRef};
    use std::ptr;

    #[link(name = "CoreText", kind = "framework")]
    unsafe extern "C" {
        fn CTFontManagerCopyAvailableFontFamilyNames() -> CFArrayRef;
        static kCTFontFamilyNameKey: CFStringRef;
        fn CTFontCreateWithName(
            name: CFStringRef,
            size: f64,
            matrix: *const std::ffi::c_void,
        ) -> CFTypeRef;
        fn CTFontCopyLocalizedName(
            font: CFTypeRef,
            name_key: CFStringRef,
            actual_language: *mut CFStringRef,
        ) -> CFStringRef;
    }

    fn localized_font_family_label(family: &str) -> Option<String> {
        let family_name = CFString::new(family);

        unsafe {
            let font = CTFontCreateWithName(family_name.as_concrete_TypeRef(), 12.0, ptr::null());
            if font.is_null() {
                return None;
            }

            let localized_name =
                CTFontCopyLocalizedName(font, kCTFontFamilyNameKey, ptr::null_mut());
            CFRelease(font);
            if localized_name.is_null() {
                return None;
            }

            let localized_name = CFString::wrap_under_create_rule(localized_name);
            Some(localized_name.to_string())
        }
    }

    unsafe {
        let names_ref = CTFontManagerCopyAvailableFontFamilyNames();
        if names_ref.is_null() {
            return Vec::new();
        }

        let names: CFArray<CFString> = TCFType::wrap_under_create_rule(names_ref);
        let entries = names.iter().map(|name| {
            let family = name.to_string();
            let label = localized_font_family_label(&family).unwrap_or_else(|| family.clone());

            SystemFontFamily { family, label }
        });

        normalize_font_family_entries(entries)
    }
}

#[cfg(not(target_os = "macos"))]
fn platform_font_family_entries() -> Vec<SystemFontFamily> {
    Vec::new()
}

#[tauri::command]
pub fn list_system_font_families() -> Vec<SystemFontFamily> {
    system_font_family_entries(platform_font_family_entries(), fontdb_font_family_names())
}

#[cfg(test)]
mod tests {
    use super::{normalize_font_family_names, system_font_family_entries, SystemFontFamily};

    #[test]
    fn normalizes_font_family_names() {
        let families = normalize_font_family_names([
            "Inter".to_string(),
            " Example Serif ".to_string(),
            "".to_string(),
            "Inter".to_string(),
        ]);

        assert_eq!(families, vec!["Example Serif", "Inter"]);
    }

    #[test]
    fn prefers_platform_font_family_names_over_fontdb_localized_aliases() {
        let families = system_font_family_entries(
            [
                SystemFontFamily {
                    family: "YuMincho".to_string(),
                    label: "YuMincho".to_string(),
                },
                SystemFontFamily {
                    family: " Inter ".to_string(),
                    label: " Inter ".to_string(),
                },
            ],
            ["游明朝".to_string(), "YuMincho".to_string()],
        );

        assert_eq!(
            families,
            vec![
                SystemFontFamily {
                    family: "Inter".to_string(),
                    label: "Inter".to_string(),
                },
                SystemFontFamily {
                    family: "YuMincho".to_string(),
                    label: "YuMincho".to_string(),
                },
            ]
        );
    }

    #[test]
    fn keeps_localized_font_labels_separate_from_css_family_names() {
        let families = system_font_family_entries(
            [
                SystemFontFamily {
                    family: "YuMincho".to_string(),
                    label: "游明朝".to_string(),
                },
                SystemFontFamily {
                    family: " Inter ".to_string(),
                    label: "".to_string(),
                },
            ],
            ["游明朝".to_string(), "YuMincho".to_string()],
        );

        assert_eq!(
            families,
            vec![
                SystemFontFamily {
                    family: "Inter".to_string(),
                    label: "Inter".to_string(),
                },
                SystemFontFamily {
                    family: "YuMincho".to_string(),
                    label: "游明朝".to_string(),
                },
            ]
        );
    }
}
