import { defaultEditorPreferences } from "../lib/settings/app-settings";
import {
  canonicalizeEditorFontFamilyPreference,
  shellCommandActionFailureMessage
} from "./useSettingsWindowState";

describe("settings window shell command errors", () => {
  it("includes native shell command failure details when available", () => {
    expect(shellCommandActionFailureMessage("Could not update the markra command.", "Registry write failed")).toBe(
      "Could not update the markra command. Registry write failed"
    );
    expect(shellCommandActionFailureMessage("Could not update the markra command.", new Error("Access denied"))).toBe(
      "Could not update the markra command. Access denied"
    );
  });

  it("falls back to the generic shell command error", () => {
    expect(shellCommandActionFailureMessage("Could not update the markra command.", "")).toBe(
      "Could not update the markra command."
    );
  });
});

describe("settings window editor font migration", () => {
  it("maps a saved localized font label to the CSS font family name", () => {
    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "示例衬线",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" },
      { family: "ExampleSans", label: "示例黑体" }
    ])).toEqual({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "ExampleSerif",
        source: "system"
      }
    });
  });

  it("does not migrate canonical or ambiguous font family names", () => {
    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "ExampleSerif",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" }
    ])).toBeNull();

    expect(canonicalizeEditorFontFamilyPreference({
      ...defaultEditorPreferences,
      editorFontFamily: {
        family: "示例衬线",
        source: "system"
      }
    }, [
      { family: "ExampleSerif", label: "示例衬线" },
      { family: "ExampleSerifAlt", label: "示例衬线" }
    ])).toBeNull();
  });
});
