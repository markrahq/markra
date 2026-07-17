import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  defaultMarkdownShortcuts,
  markdownShortcutFromKeyboardEvent,
  normalizeMarkdownShortcuts,
  parseMarkdownShortcut,
  type MarkdownShortcutAction,
  type MarkdownShortcutBindings
} from "@markra/editor";
import type { I18nKey } from "@markra/shared";
import { showAppToast } from "../../lib/app-toast";
import type { EditorPreferences } from "../../lib/settings/app-settings";
import type { DesktopPlatform } from "../../lib/platform";
import {
  SettingsButton,
  SettingsRow,
  SettingsSection
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

const markdownShortcutLabelKeys: Record<MarkdownShortcutAction, I18nKey> = {
  bold: "menu.bold",
  bulletList: "menu.bulletList",
  codeBlock: "menu.codeBlock",
  heading1: "menu.heading1",
  heading2: "menu.heading2",
  heading3: "menu.heading3",
  image: "menu.image",
  inlineCode: "menu.inlineCode",
  italic: "menu.italic",
  link: "menu.link",
  openQuickOpen: "app.quickOpen",
  openSpellcheckSuggestions: "editor.spellcheckSuggestions",
  orderedList: "menu.orderedList",
  paragraph: "menu.paragraph",
  quote: "menu.quote",
  syncNow: "settings.sync.run",
  strikethrough: "menu.strikethrough",
  table: "menu.table",
  toggleAiAgent: "app.toggleAiAgent",
  toggleAiCommand: "app.aiCommandDialog",
  toggleAllFolds: "editor.toggleAllFolds",
  toggleDocumentHistory: "app.documentHistory",
  toggleMarkdownFiles: "app.toggleMarkdownFiles",
  toggleReadOnlyMode: "app.toggleReadOnlyMode",
  toggleSourceMode: "app.switchToSourceMode"
};

const keyboardShortcutSections: Array<{
  labelKey: I18nKey;
  actions: MarkdownShortcutAction[];
}> = [
  {
    labelKey: "settings.editor.shortcutsGroupApp",
    actions: [
      "openQuickOpen",
      "syncNow",
      "toggleMarkdownFiles",
      "toggleDocumentHistory",
      "toggleAiAgent",
      "toggleAiCommand",
      "toggleSourceMode",
      "toggleReadOnlyMode"
    ]
  },
  {
    labelKey: "settings.categories.editor",
    actions: [
      "bold",
      "italic",
      "strikethrough",
      "inlineCode",
      "paragraph",
      "heading1",
      "heading2",
      "heading3",
      "bulletList",
      "orderedList",
      "quote",
      "codeBlock",
      "link",
      "image",
      "table",
      "toggleAllFolds",
      "openSpellcheckSuggestions"
    ]
  }
];

// This inventory mirrors the non-configurable handlers in useNativeBindings and Tauri's native
// menu accelerators; keep them aligned so settings never advertise stale shortcuts.
const fixedKeyboardShortcuts: Array<{
  desktopOnly?: boolean;
  labelKey: I18nKey;
  nonMacAlternateShortcut?: string;
  shortcut: string;
}> = [
  { desktopOnly: true, labelKey: "menu.newDocument", shortcut: "Mod+N" },
  { labelKey: "menu.openDocument", shortcut: "Mod+O" },
  { labelKey: "app.openFolderDialog", shortcut: "Mod+Shift+O" },
  { labelKey: "settings.editor.shortcutCloseDocument", shortcut: "Mod+W" },
  { labelKey: "menu.saveDocument", shortcut: "Mod+S" },
  { labelKey: "menu.saveDocumentAs", shortcut: "Mod+Shift+S" },
  { labelKey: "settings.editor.shortcutDocumentSearch", shortcut: "Mod+F" },
  {
    labelKey: "settings.editor.shortcutDocumentReplace",
    nonMacAlternateShortcut: "Mod+H",
    shortcut: "Mod+Alt+F"
  },
  { labelKey: "app.workspaceSearch.searchWorkspace", shortcut: "Mod+Shift+F" },
  { labelKey: "menu.exportPdf", shortcut: "Mod+Alt+P" },
  { labelKey: "menu.exportHtml", shortcut: "Mod+Shift+E" },
  { labelKey: "menu.settings", shortcut: "Mod+," }
];

function keyboardShortcutActionAvailable(action: MarkdownShortcutAction, aiEnabled: boolean) {
  return aiEnabled || (action !== "toggleAiAgent" && action !== "toggleAiCommand");
}

function assignKeyboardShortcut(
  shortcuts: MarkdownShortcutBindings,
  action: MarkdownShortcutAction,
  nextShortcut: string
) {
  const nextShortcuts: MarkdownShortcutBindings = {
    ...shortcuts,
    [action]: nextShortcut
  };
  const previousShortcut = shortcuts[action];
  const conflictingAction = (Object.keys(shortcuts) as MarkdownShortcutAction[]).find(
    (candidate) => candidate !== action && shortcuts[candidate] === nextShortcut
  );

  if (conflictingAction) {
    nextShortcuts[conflictingAction] = previousShortcut;
  }

  return normalizeMarkdownShortcuts(nextShortcuts);
}

function formatShortcutForPlatform(shortcut: string, platform: DesktopPlatform) {
  const parsed = parseMarkdownShortcut(shortcut);
  if (!parsed) return shortcut;

  if (platform === "macos") {
    return [
      "⌘",
      parsed.shift ? "⇧" : null,
      parsed.alt ? "⌥" : null,
      parsed.key
    ].filter((part): part is string => Boolean(part)).join("+");
  }

  return [
    "Ctrl",
    parsed.shift ? "Shift" : null,
    parsed.alt ? "Alt" : null,
    parsed.key
  ].filter((part): part is string => Boolean(part)).join("+");
}

function formatFixedShortcutForPlatform(
  shortcut: typeof fixedKeyboardShortcuts[number],
  platform: DesktopPlatform
) {
  return [
    formatShortcutForPlatform(shortcut.shortcut, platform),
    platform !== "macos" && shortcut.nonMacAlternateShortcut
      ? formatShortcutForPlatform(shortcut.nonMacAlternateShortcut, platform)
      : null
  ].filter((value): value is string => Boolean(value)).join(" · ");
}

function ShortcutCaptureButton({
  active,
  actionLabel,
  platform,
  shortcut,
  translate,
  onStart
}: {
  active: boolean;
  actionLabel: string;
  platform: DesktopPlatform;
  shortcut: string;
  translate: SettingsTranslate;
  onStart: () => unknown;
}) {
  return (
    <button
      className={`inline-flex h-8 min-w-28 items-center justify-center rounded-md border px-3 font-mono text-[12px] leading-5 font-[650] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
        active
          ? "border-(--accent) bg-(--bg-active) text-(--text-heading)"
          : "border-(--border-default) bg-(--bg-primary) text-(--text-heading) hover:bg-(--bg-hover)"
      }`}
      type="button"
      aria-label={`${actionLabel} ${translate("settings.editor.shortcutAriaSuffix")}`}
      aria-pressed={active}
      onClick={onStart}
    >
      {active ? translate("settings.editor.shortcutRecording") : formatShortcutForPlatform(shortcut, platform)}
    </button>
  );
}

export function KeyboardShortcutsSettings({
  aiEnabled = true,
  newDocumentShortcutAvailable = true,
  onUpdatePreferences,
  platform = "macos",
  preferences,
  translate
}: {
  aiEnabled?: boolean;
  newDocumentShortcutAvailable?: boolean;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  platform?: DesktopPlatform;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const [activeAction, setActiveAction] = useState<MarkdownShortcutAction | null>(null);
  const shortcuts = useMemo(
    () => normalizeMarkdownShortcuts(preferences.markdownShortcuts),
    [preferences.markdownShortcuts]
  );
  const availableShortcutSections = useMemo(
    () => keyboardShortcutSections
      .map((section) => ({
        ...section,
        actions: section.actions.filter((action) => keyboardShortcutActionAvailable(action, aiEnabled))
      }))
      .filter((section) => section.actions.length > 0),
    [aiEnabled]
  );
  const availableFixedKeyboardShortcuts = fixedKeyboardShortcuts.filter(
    (shortcut) => newDocumentShortcutAvailable || !shortcut.desktopOnly
  );

  useEffect(() => {
    if (activeAction && !keyboardShortcutActionAvailable(activeAction, aiEnabled)) setActiveAction(null);
  }, [activeAction, aiEnabled]);

  useEffect(() => {
    if (!activeAction) return;

    const handleShortcutCapture = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setActiveAction(null);
        return;
      }

      const nextShortcut = markdownShortcutFromKeyboardEvent(event);
      if (!nextShortcut) return;

      event.preventDefault();
      event.stopPropagation();
      const nextShortcuts = assignKeyboardShortcut(shortcuts, activeAction, nextShortcut);

      // Normalization restores reserved chords to the action default. Compare before saving so a
      // rejected capture is visible to the user instead of looking like a successful no-op.
      if (nextShortcuts[activeAction] !== nextShortcut) {
        showAppToast({
          duration: 4500,
          id: "keyboard-shortcut-conflict",
          message: translate("settings.editor.shortcutConflict"),
          status: "error"
        });
        setActiveAction(null);
        return;
      }

      onUpdatePreferences({
        ...preferences,
        markdownShortcuts: nextShortcuts
      });
      setActiveAction(null);
    };

    window.addEventListener("keydown", handleShortcutCapture, true);

    return () => {
      window.removeEventListener("keydown", handleShortcutCapture, true);
    };
  }, [activeAction, onUpdatePreferences, preferences, shortcuts, translate]);

  return (
    <SettingsSection label={translate("settings.sections.keyboardShortcuts")}>
      <SettingsRow
        title={translate("settings.editor.shortcuts")}
        description={translate("settings.editor.shortcutsDescription")}
        action={
          <SettingsButton
            label={translate("settings.editor.shortcutsResetLabel")}
            onClick={() => {
              setActiveAction(null);
              onUpdatePreferences({
                ...preferences,
                markdownShortcuts: { ...defaultMarkdownShortcuts }
              });
            }}
          >
            <RotateCcw aria-hidden="true" size={13} />
            {translate("settings.editor.shortcutsReset")}
          </SettingsButton>
        }
      />
      <div className="divide-y divide-(--border-default)">
        {availableShortcutSections.map((section) => (
          <div key={section.labelKey} className="py-4 first:pt-3 last:pb-4">
            <h4 className="m-0 mb-3 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)">
              {translate(section.labelKey)}
            </h4>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 max-[760px]:grid-cols-1">
              {section.actions.map((action) => {
                const actionLabel = translate(markdownShortcutLabelKeys[action]);

                return (
                  <div
                    key={action}
                    className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <span className="min-w-0 truncate text-[12px] leading-5 font-[560] text-(--text-heading)">
                      {actionLabel}
                    </span>
                    <ShortcutCaptureButton
                      active={activeAction === action}
                      actionLabel={actionLabel}
                      platform={platform}
                      shortcut={shortcuts[action]}
                      translate={translate}
                      onStart={() => setActiveAction(action)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="py-4 first:pt-3 last:pb-4">
          <h4 className="m-0 mb-3 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)">
            {translate("settings.editor.shortcutsGroupFixed")}
          </h4>
          <div className="grid grid-cols-2 gap-x-5 gap-y-2 max-[760px]:grid-cols-1">
            {availableFixedKeyboardShortcuts.map((shortcut) => (
              <div
                key={shortcut.labelKey}
                className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
              >
                <span className="min-w-0 truncate text-[12px] leading-5 font-[560] text-(--text-heading)">
                  {translate(shortcut.labelKey)}
                </span>
                <kbd className="inline-flex h-8 min-w-28 items-center justify-center whitespace-nowrap rounded-md border border-(--border-default) bg-(--bg-secondary) px-3 font-mono text-[12px] leading-5 font-[650] text-(--text-heading)">
                  {formatFixedShortcutForPlatform(shortcut, platform)}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
