import {
  Bot,
  ChevronDown,
  Code2,
  Cloud,
  Database,
  Download,
  HardDrive,
  Languages,
  Moon,
  PanelRight,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Upload,
  type LucideIcon
} from "lucide-react";
import {
  Children,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  closestCenter,
  DndContext,
  MouseSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Button, IconButton, SegmentedControl, SegmentedControlItem, Switch } from "@markra/ui";
import {
  defaultMarkdownShortcuts,
  markdownShortcutFromKeyboardEvent,
  normalizeMarkdownShortcuts,
  parseMarkdownShortcut,
  type MarkdownShortcutAction
} from "@markra/editor";
import {
  defaultTitlebarActions,
  appThemeOptions,
  defaultCustomThemeCss,
  reorderTitlebarActions,
  type AppTheme,
  type AiSelectionDisplayMode,
  type EditorPreferences,
  type ExportSettings as ExportSettingsValue,
  type ImageUploadProvider,
  type PdfMarginPreset,
  type PdfPageSize,
  type TitlebarActionId,
  type TitlebarActionPreference,
  type WebSearchProviderId,
  type WebSearchSettings
} from "../lib/settings/app-settings";
import {
  aiQuickActionIds,
  aiQuickActionLabelKeys,
  defaultAiQuickActionPrompt,
  defaultAiQuickActionPrompts,
  type AiQuickActionId
} from "../lib/ai-actions";
import type { DesktopPlatform } from "../lib/platform";
import {
  aiTranslationLanguageName,
  clampNumber,
  supportedLanguages,
  type AppLanguage,
  type I18nKey
} from "@markra/shared";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  normalizeEditorContentWidthPx
} from "../lib/editor-width";
import { SortableTitlebarAction } from "./SortableTitlebarAction";

type Translate = (key: I18nKey) => string;

const themeLabelKeys: Record<AppTheme, I18nKey> = {
  system: "settings.theme.system",
  light: "settings.theme.light",
  dark: "settings.theme.dark",
  github: "settings.theme.github",
  gothic: "settings.theme.gothic",
  newsprint: "settings.theme.newsprint",
  night: "settings.theme.night",
  pixyll: "settings.theme.pixyll",
  whitey: "settings.theme.whitey",
  sepia: "settings.theme.sepia",
  "solarized-light": "settings.theme.solarizedLight",
  "solarized-dark": "settings.theme.solarizedDark",
  nord: "settings.theme.nord",
  "catppuccin-latte": "settings.theme.catppuccinLatte",
  "catppuccin-mocha": "settings.theme.catppuccinMocha",
  academic: "settings.theme.academic",
  minimal: "settings.theme.minimal",
  custom: "settings.theme.custom"
};

type ThemePreviewSwatch = {
  accent: string;
  background: string;
  border: string;
  muted: string;
  panel: string;
  text: string;
};

type ThemePreviewStyle = CSSProperties & {
  "--theme-preview-accent": string;
  "--theme-preview-bg": string;
  "--theme-preview-border": string;
  "--theme-preview-muted": string;
  "--theme-preview-panel": string;
  "--theme-preview-text": string;
};

const themePreviewSwatches: Record<AppTheme, ThemePreviewSwatch> = {
  system: {
    accent: "#1a1c1e",
    background: "linear-gradient(135deg, #f6f8fa 0 49%, #1f2328 50% 100%)",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#ffffff",
    text: "#1f2328"
  },
  light: {
    accent: "#1a1c1e",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  },
  dark: {
    accent: "#f4f4f5",
    background: "#0d1117",
    border: "#30363d",
    muted: "#8b949e",
    panel: "#161b22",
    text: "#f0f6fc"
  },
  github: {
    accent: "#0969da",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  },
  gothic: {
    accent: "#7f1d1d",
    background: "#f7f1e5",
    border: "#d8ccb5",
    muted: "#736451",
    panel: "#efe5d2",
    text: "#2b2118"
  },
  newsprint: {
    accent: "#175c63",
    background: "#fbf7ef",
    border: "#d7cabb",
    muted: "#6f6358",
    panel: "#f3eadb",
    text: "#241f1a"
  },
  night: {
    accent: "#f4f4f5",
    background: "#111827",
    border: "#374151",
    muted: "#9ca3af",
    panel: "#1f2937",
    text: "#f9fafb"
  },
  pixyll: {
    accent: "#d9480f",
    background: "#fffaf0",
    border: "#e7d5b7",
    muted: "#7d6b57",
    panel: "#f8ecd7",
    text: "#33261a"
  },
  whitey: {
    accent: "#2563eb",
    background: "#fdfdfd",
    border: "#e5e7eb",
    muted: "#6b7280",
    panel: "#f7f7f8",
    text: "#111827"
  },
  sepia: {
    accent: "#8b5e34",
    background: "#fbf0d9",
    border: "#dec69f",
    muted: "#7b684e",
    panel: "#f3e3c4",
    text: "#3b2f22"
  },
  "solarized-light": {
    accent: "#268bd2",
    background: "#fdf6e3",
    border: "#d9cda9",
    muted: "#657b83",
    panel: "#eee8d5",
    text: "#586e75"
  },
  "solarized-dark": {
    accent: "#2aa198",
    background: "#002b36",
    border: "#073642",
    muted: "#93a1a1",
    panel: "#073642",
    text: "#eee8d5"
  },
  nord: {
    accent: "#88c0d0",
    background: "#2e3440",
    border: "#4c566a",
    muted: "#d8dee9",
    panel: "#3b4252",
    text: "#eceff4"
  },
  "catppuccin-latte": {
    accent: "#8839ef",
    background: "#eff1f5",
    border: "#ccd0da",
    muted: "#6c6f85",
    panel: "#e6e9ef",
    text: "#4c4f69"
  },
  "catppuccin-mocha": {
    accent: "#cba6f7",
    background: "#1e1e2e",
    border: "#45475a",
    muted: "#a6adc8",
    panel: "#313244",
    text: "#cdd6f4"
  },
  academic: {
    accent: "#1d4ed8",
    background: "#fffffb",
    border: "#d7d2c5",
    muted: "#5f5a51",
    panel: "#f4f1ea",
    text: "#1f1b16"
  },
  minimal: {
    accent: "#3f3f46",
    background: "#fafafa",
    border: "#e4e4e7",
    muted: "#71717a",
    panel: "#f4f4f5",
    text: "#27272a"
  },
  custom: {
    accent: "#1a1c1e",
    background: "#ffffff",
    border: "#d1d9e0",
    muted: "#59636e",
    panel: "#f6f8fa",
    text: "#1f2328"
  }
};

const imageUploadProviderOptions: Array<{
  actionLabelKey: I18nKey;
  icon: LucideIcon;
  labelKey: I18nKey;
  value: ImageUploadProvider;
}> = [
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useLocal",
    icon: HardDrive,
    labelKey: "settings.editor.imageUploadProvider.local",
    value: "local"
  },
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useWebDav",
    icon: Cloud,
    labelKey: "settings.editor.imageUploadProvider.webdav",
    value: "webdav"
  },
  {
    actionLabelKey: "settings.editor.imageUploadProvider.useS3",
    icon: Database,
    labelKey: "settings.editor.imageUploadProvider.s3",
    value: "s3"
  }
];

const imageUploadProviderSettingsActionLabelKeys: Record<ImageUploadProvider, I18nKey> = {
  local: "settings.editor.imageUploadProvider.showLocalSettings",
  s3: "settings.editor.imageUploadProvider.showS3Settings",
  webdav: "settings.editor.imageUploadProvider.showWebDavSettings"
};

const aiSelectionDisplayModeOptions: Array<{
  actionLabelKey: I18nKey;
  icon: LucideIcon;
  labelKey: I18nKey;
  value: AiSelectionDisplayMode;
}> = [
  {
    actionLabelKey: "settings.editor.aiSelectionDisplayMode.useCommand",
    icon: Bot,
    labelKey: "settings.editor.aiSelectionDisplayMode.command",
    value: "command"
  },
  {
    actionLabelKey: "settings.editor.aiSelectionDisplayMode.useToolbar",
    icon: Sparkles,
    labelKey: "settings.editor.aiSelectionDisplayMode.toolbar",
    value: "toolbar"
  }
];

const titlebarActionOptions: Array<{
  icon: LucideIcon;
  id: TitlebarActionId;
  labelKey: I18nKey;
}> = [
  {
    icon: Bot,
    id: "aiAgent",
    labelKey: "app.toggleAiAgent"
  },
  {
    icon: Code2,
    id: "sourceMode",
    labelKey: "app.switchToSourceMode"
  },
  {
    icon: PanelRight,
    id: "splitMode",
    labelKey: "app.switchToSplitMode"
  },
  {
    icon: Save,
    id: "save",
    labelKey: "app.saveMarkdown"
  },
  {
    icon: Moon,
    id: "theme",
    labelKey: "app.switchToDarkTheme"
  }
];

const bodyFontSizeOptions = [14, 15, 16, 17, 18, 20];
const contentWidthRatioSpanPx = editorCustomContentWidthMax - editorCustomContentWidthMin;
const contentWidthRatioMin = 0;
const contentWidthRatioMax = 100;
const titlebarActionDragThresholdPx = 4;
const exportMarginPresetOptions: PdfMarginPreset[] = ["default", "none", "narrow", "normal", "wide", "custom"];
const exportPageSizeOptions: PdfPageSize[] = ["default", "a4", "letter", "custom"];
const lineHeightOptions = [1.5, 1.65, 1.8];
const webSearchProviderOptions: WebSearchProviderId[] = ["local-bing", "searxng"];
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
  orderedList: "menu.orderedList",
  paragraph: "menu.paragraph",
  quote: "menu.quote",
  strikethrough: "menu.strikethrough",
  table: "menu.table",
  toggleAiAgent: "app.toggleAiAgent",
  toggleAiCommand: "app.aiCommandDialog",
  toggleMarkdownFiles: "app.toggleMarkdownFiles",
  toggleReadOnlyMode: "app.toggleReadOnlyMode",
  toggleSourceMode: "app.switchToSourceMode"
};
const titlebarActionVisibleClassName =
  "aria-[pressed=true]:border-transparent aria-[pressed=true]:bg-(--bg-active) aria-[pressed=true]:text-(--text-heading) aria-[pressed=true]:opacity-100 aria-[pressed=true]:hover:bg-(--bg-active)";
const titlebarActionHiddenClassName = "text-(--text-secondary) opacity-55 hover:opacity-100";

function mergeClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

const keyboardShortcutSections: Array<{
  labelKey: I18nKey;
  actions: MarkdownShortcutAction[];
}> = [
  {
    labelKey: "settings.editor.shortcutsGroupApp",
    actions: ["toggleMarkdownFiles", "toggleAiAgent", "toggleAiCommand", "toggleSourceMode", "toggleReadOnlyMode"]
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
      "table"
    ]
  }
];

const exportPageSizeDimensions: Record<Exclude<PdfPageSize, "custom">, { heightMm: number; widthMm: number }> = {
  a4: { heightMm: 297, widthMm: 210 },
  default: { heightMm: 297, widthMm: 210 },
  letter: { heightMm: 279, widthMm: 216 }
};

const exportMarginPresetMm: Record<Exclude<PdfMarginPreset, "custom">, number> = {
  default: 18,
  narrow: 10,
  none: 0,
  normal: 18,
  wide: 25
};

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

function SettingsSection({ children, label }: { children: ReactNode; label: string }) {
  const sectionId = `settings-section-${label.replace(/\s+/g, "-")}`;
  const hasMultipleRows = Children.count(children) > 1;

  return (
    <section className="settings-section mb-8 last:mb-0" aria-labelledby={sectionId}>
      <h3
        className="m-0 mb-3 text-[12px] leading-5 font-bold tracking-normal text-(--text-secondary)"
        id={sectionId}
      >
        {label}
      </h3>
      <div className={hasMultipleRows ? "settings-list-group divide-y divide-(--border-default)" : "settings-list-group"}>
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  action,
  description,
  title
}: {
  action?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <div className="settings-row grid min-h-15 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 py-4">
      <div className="min-w-0">
        <p className="m-0 text-[13px] leading-5 font-[650] tracking-normal text-(--text-heading)">{title}</p>
        {description ? (
          <p className="m-0 mt-0.5 text-[12px] leading-4.5 font-[450] text-(--text-secondary)">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center justify-end">{action}</div> : null}
    </div>
  );
}

function SettingsSwitch({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => unknown;
}) {
  return <Switch checked={checked} label={label} onCheckedChange={onChange} />;
}

function SettingsSelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => unknown;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        className="h-8 min-w-36 appearance-none rounded-md border border-(--border-default) bg-(--bg-primary) py-0 pr-8 pl-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 text-(--text-secondary)"
        size={13}
      />
    </div>
  );
}

function SettingsTextInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  widthClassName = "w-44"
}: {
  label: string;
  onChange: (value: string) => unknown;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
  widthClassName?: string;
}) {
  return (
    <input
      className={`h-8 ${widthClassName} rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)`}
      type={type}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function SettingsTextarea({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => unknown;
  value: string;
}) {
  return (
    <textarea
      className="min-h-18 w-80 resize-y rounded-md border border-(--border-default) bg-(--bg-primary) px-3 py-2 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out placeholder:text-(--text-secondary) hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) max-[760px]:w-full"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function createThemePreviewStyle(swatch: ThemePreviewSwatch): ThemePreviewStyle {
  return {
    "--theme-preview-accent": swatch.accent,
    "--theme-preview-bg": swatch.background,
    "--theme-preview-border": swatch.border,
    "--theme-preview-muted": swatch.muted,
    "--theme-preview-panel": swatch.panel,
    "--theme-preview-text": swatch.text
  };
}

function ThemePreviewGrid({
  onSelectTheme,
  selectedTheme,
  translate
}: {
  onSelectTheme: (theme: AppTheme) => unknown;
  selectedTheme: AppTheme;
  translate: Translate;
}) {
  return (
    <div
      className="grid w-fit max-w-[360px] grid-cols-9 gap-1.5 max-[860px]:grid-cols-6"
      role="radiogroup"
      aria-label={translate("settings.theme.previewTitle")}
    >
      {appThemeOptions.map((theme) => {
        const label = translate(themeLabelKeys[theme]);
        const selected = theme === selectedTheme;

        return (
          <button
            key={theme}
            className={mergeClassNames(
              "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border bg-(--bg-primary) p-0 transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)",
              selected ? "border-(--accent) bg-(--accent-soft)" : "border-(--border-default)"
            )}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            style={createThemePreviewStyle(themePreviewSwatches[theme])}
            onClick={() => onSelectTheme(theme)}
          >
            <span
              className="relative h-6 w-6 overflow-hidden rounded-[5px] border"
              style={{
                background: "var(--theme-preview-bg)",
                borderColor: "var(--theme-preview-border)"
              }}
              aria-hidden="true"
            >
              <span
                className="absolute top-1 left-1 h-1 w-3 rounded-full"
                style={{ background: "var(--theme-preview-text)" }}
              />
              <span
                className="absolute top-2.5 left-1 h-1 w-3.5 rounded-full"
                style={{ background: "var(--theme-preview-muted)" }}
              />
              <span
                className="absolute right-1 bottom-1 h-2 w-2 rounded-full"
                style={{ background: "var(--theme-preview-accent)" }}
              />
              <span
                className="absolute bottom-1 left-1 h-1.5 w-3.5 rounded-sm"
                style={{ background: "var(--theme-preview-panel)" }}
              />
            </span>
            {selected ? <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-(--accent)" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function exportCustomThemeCss(css: string) {
  const exportCss = css.trim().length > 0 ? css : defaultCustomThemeCss;
  const objectUrl = URL.createObjectURL(new Blob([exportCss], { type: "text/css;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = "markra-custom-theme.css";
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function CustomThemeCssControl({
  customThemeCss,
  onUpdateCustomThemeCss,
  translate
}: {
  customThemeCss: string;
  onUpdateCustomThemeCss: (css: string) => unknown;
  translate: Translate;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLabel = translate("settings.theme.importCustomCss");
  const exportLabel = translate("settings.theme.exportCustomCss");
  const resetLabel = translate("settings.theme.resetCustomCss");

  function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = "";
    if (!file) return;

    file.text()
      .then((css) => onUpdateCustomThemeCss(css))
      .catch(() => {});
  }

  return (
    <div className="flex w-80 max-w-full flex-col items-stretch gap-2">
      <SettingsTextarea
        label={translate("settings.theme.customCssTitle")}
        value={customThemeCss}
        onChange={onUpdateCustomThemeCss}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <SettingsButton label={importLabel} onClick={() => fileInputRef.current?.click()}>
          <Upload aria-hidden="true" size={13} />
          {importLabel}
        </SettingsButton>
        <SettingsButton label={exportLabel} onClick={() => exportCustomThemeCss(customThemeCss)}>
          <Download aria-hidden="true" size={13} />
          {exportLabel}
        </SettingsButton>
        <SettingsButton label={resetLabel} onClick={() => onUpdateCustomThemeCss(defaultCustomThemeCss)}>
          <RotateCcw aria-hidden="true" size={13} />
          {resetLabel}
        </SettingsButton>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".css,text/css"
        hidden
        onChange={handleImportFile}
      />
    </div>
  );
}

function SettingsNumberInput({
  label,
  max,
  min,
  onChange,
  step = 1,
  unit,
  value
}: {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => unknown;
  step?: number;
  unit?: string;
  value: number;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        className="h-8 w-24 rounded-md border border-(--border-default) bg-(--bg-primary) px-3 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {unit ? (
        <span className="text-[12px] leading-5 font-[560] text-(--text-secondary)" aria-hidden="true">
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function contentWidthRatioValue(preferences: EditorPreferences) {
  const contentWidthPx = preferences.contentWidthPx ?? editorContentWidthPixels[preferences.contentWidth];

  return Math.round(((contentWidthPx - editorCustomContentWidthMin) / contentWidthRatioSpanPx) * 100);
}

function contentWidthPxFromRatio(value: number) {
  const ratio = clampNumber(value, contentWidthRatioMin, contentWidthRatioMax);
  if (ratio === null) return null;

  return normalizeEditorContentWidthPx(Math.round(editorCustomContentWidthMin + (contentWidthRatioSpanPx * ratio) / 100));
}

function SettingsContentWidthInput({
  label,
  onUpdatePreferences,
  preferences,
  resetLabel
}: {
  label: string;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  resetLabel: string;
}) {
  const ratio = contentWidthRatioValue(preferences);
  const [draftRatio, setDraftRatio] = useState(String(ratio));

  useEffect(() => {
    setDraftRatio(String(ratio));
  }, [ratio]);

  return (
    <div className="content-width-ratio-control inline-flex h-8 items-center overflow-hidden rounded-md border border-(--border-default) bg-(--bg-primary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-within:ring-2 focus-within:ring-(--accent)">
      <div className="relative inline-flex h-full items-center">
        <input
          className="h-full w-18 border-0 bg-transparent py-0 pr-7 pl-3 text-[12px] leading-5 font-[560] text-(--text-heading) outline-none"
          type="text"
          aria-label={label}
          inputMode="numeric"
          min={contentWidthRatioMin}
          max={contentWidthRatioMax}
          pattern="[0-9]*"
          value={draftRatio}
          onChange={(event) => {
            const digits = event.currentTarget.value.replace(/\D/g, "");
            if (!digits) {
              setDraftRatio("");
              return;
            }

            const normalizedDigits = digits.replace(/^0+(?=\d)/, "");
            const nextRatio = Number(normalizedDigits);
            if (!Number.isFinite(nextRatio)) return;

            const nextContentWidthPx = contentWidthPxFromRatio(nextRatio);
            if (nextContentWidthPx === null) return;

            setDraftRatio(String(clampNumber(nextRatio, contentWidthRatioMin, contentWidthRatioMax) ?? ratio));
            onUpdatePreferences({
              ...preferences,
              contentWidth: "default",
              contentWidthPx: nextContentWidthPx
            });
          }}
          onBlur={() => {
            if (draftRatio) return;

            setDraftRatio(String(ratio));
          }}
        />
        <span
          className="pointer-events-none absolute right-2.5 text-[12px] leading-5 font-[560] text-(--text-secondary)"
          aria-hidden="true"
        >
          %
        </span>
      </div>
      <button
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 border-l border-(--border-default) bg-transparent text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        type="button"
        aria-label={resetLabel}
        title={resetLabel}
        onClick={() => {
          setDraftRatio(String(contentWidthRatioValue({
            ...preferences,
            contentWidth: "default",
            contentWidthPx: null
          })));
          onUpdatePreferences({
            ...preferences,
            contentWidth: "default",
            contentWidthPx: null
          });
        }}
      >
        <RotateCcw aria-hidden="true" size={13} />
      </button>
    </div>
  );
}

function SettingsCheckbox({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: () => unknown;
}) {
  return (
    <label className="inline-flex h-8 items-center gap-2 text-[12px] leading-5 font-[560] text-(--text-heading)">
      <input
        className="size-4 rounded border-(--border-default) accent-(--accent)"
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}

function exportPageSizeLabelKey(pageSize: PdfPageSize) {
  return `settings.export.pageSize.${pageSize}` as I18nKey;
}

function exportMarginPresetLabelKey(preset: PdfMarginPreset) {
  return `settings.export.margin.${preset}` as I18nKey;
}

function applyExportPageSize(settings: ExportSettingsValue, pageSize: PdfPageSize): ExportSettingsValue {
  if (pageSize === "custom") {
    return {
      ...settings,
      pdfPageSize: pageSize
    };
  }

  const dimensions = exportPageSizeDimensions[pageSize];

  return {
    ...settings,
    pdfHeightMm: dimensions.heightMm,
    pdfPageSize: pageSize,
    pdfWidthMm: dimensions.widthMm
  };
}

function applyExportMarginPreset(settings: ExportSettingsValue, preset: PdfMarginPreset): ExportSettingsValue {
  if (preset === "custom") {
    return {
      ...settings,
      pdfMarginPreset: preset
    };
  }

  return {
    ...settings,
    pdfMarginMm: exportMarginPresetMm[preset],
    pdfMarginPreset: preset
  };
}

function SettingsButton({
  children,
  label,
  onClick
}: {
  children: ReactNode;
  label: string;
  onClick: () => unknown;
}) {
  return (
    <Button
      className="gap-1.5"
      size="sm"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function LanguageSelect({
  language,
  label,
  onSelectLanguage
}: {
  language: AppLanguage;
  label: string;
  onSelectLanguage: (language: AppLanguage) => unknown;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Languages aria-hidden="true" className="pointer-events-none absolute left-2.5 text-(--text-secondary)" size={13} />
      <select
        className="h-8 min-w-42 appearance-none rounded-md border border-(--border-default) bg-(--bg-primary) px-8 text-[12px] leading-5 font-[560] text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        aria-label={label}
        value={language}
        onChange={(event) => onSelectLanguage(event.currentTarget.value as AppLanguage)}
      >
        {supportedLanguages.map((supportedLanguage) => (
          <option key={supportedLanguage.code} value={supportedLanguage.code}>
            {supportedLanguage.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ImageUploadProviderControl({
  onSelectProvider,
  provider,
  translate
}: {
  onSelectProvider: (provider: ImageUploadProvider) => unknown;
  provider: ImageUploadProvider;
  translate: Translate;
}) {
  return (
    <SegmentedControl className="grid-cols-3" label={translate("settings.editor.imageUploadProvider")}>
      {imageUploadProviderOptions.map((option) => {
        const Icon = option.icon;
        const active = provider === option.value;

        return (
          <SegmentedControlItem
            key={option.value}
            label={translate(option.actionLabelKey)}
            selected={active}
            onClick={() => onSelectProvider(option.value)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(option.labelKey)}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}

function ImageUploadProviderSettingsControl({
  onSelectProvider,
  provider,
  translate
}: {
  onSelectProvider: (provider: ImageUploadProvider) => unknown;
  provider: ImageUploadProvider;
  translate: Translate;
}) {
  return (
    <SegmentedControl className="grid-cols-3" label={translate("settings.editor.imageUploadProviderSettings")}>
      {imageUploadProviderOptions.map((option) => {
        const Icon = option.icon;
        const active = provider === option.value;

        return (
          <SegmentedControlItem
            key={option.value}
            label={translate(imageUploadProviderSettingsActionLabelKeys[option.value])}
            selected={active}
            onClick={() => onSelectProvider(option.value)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(option.labelKey)}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}

function AiSelectionDisplayModeControl({
  mode,
  onSelectMode,
  translate
}: {
  mode: AiSelectionDisplayMode;
  onSelectMode: (mode: AiSelectionDisplayMode) => unknown;
  translate: Translate;
}) {
  return (
    <SegmentedControl className="grid-cols-2" label={translate("settings.editor.aiSelectionDisplayMode")}>
      {aiSelectionDisplayModeOptions.map((option) => {
        const Icon = option.icon;
        const active = mode === option.value;

        return (
          <SegmentedControlItem
            key={option.value}
            label={translate(option.actionLabelKey)}
            selected={active}
            onClick={() => onSelectMode(option.value)}
          >
            <Icon aria-hidden="true" size={13} />
            {translate(option.labelKey)}
          </SegmentedControlItem>
        );
      })}
    </SegmentedControl>
  );
}

function StorageTypeControlRow({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  const imageUpload = preferences.imageUpload;

  return (
    <SettingsRow
      title={translate("settings.editor.imageUploadProvider")}
      description={translate("settings.editor.imageUploadProviderDescription")}
      action={
        <ImageUploadProviderControl
          provider={imageUpload.provider}
          translate={translate}
          onSelectProvider={(provider) =>
            onUpdatePreferences({
              ...preferences,
              imageUpload: {
                ...imageUpload,
                provider
              }
            })
          }
        />
      }
    />
  );
}

function titlebarActionOption(id: TitlebarActionId) {
  return titlebarActionOptions.find((option) => option.id === id) ?? titlebarActionOptions[0]!;
}

function SettingsTitlebarActionsControl({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  const actions = preferences.titlebarActions;
  const draggingActionIdRef = useRef<TitlebarActionId | null>(null);
  const suppressActionClickIdsRef = useRef(new Set<TitlebarActionId>());
  const actionIds = useMemo(() => actions.map((action) => action.id), [actions]);
  const sensors = useSensors(useSensor(MouseSensor, {
    activationConstraint: {
      distance: titlebarActionDragThresholdPx
    }
  }));
  const updateActions = (titlebarActions: TitlebarActionPreference[]) => {
    onUpdatePreferences({
      ...preferences,
      titlebarActions
    });
  };
  const toggleAction = (id: TitlebarActionId) => {
    updateActions(actions.map((action) =>
      action.id === id ? { ...action, visible: !action.visible } : action
    ));
  };
  const titlebarActionIdFromDndId = (id: UniqueIdentifier) => {
    const actionId = id as TitlebarActionId;

    return actions.some((action) => action.id === actionId) ? actionId : null;
  };
  const suppressActionClick = (id: TitlebarActionId) => {
    suppressActionClickIdsRef.current.add(id);
    window.setTimeout(() => {
      suppressActionClickIdsRef.current.delete(id);
    }, 0);
  };
  const handleDragStart = ({ active }: DragStartEvent) => {
    draggingActionIdRef.current = titlebarActionIdFromDndId(active.id);
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const draggedId = titlebarActionIdFromDndId(active.id);
    const targetId = over ? titlebarActionIdFromDndId(over.id) : null;
    draggingActionIdRef.current = null;
    if (draggedId) suppressActionClick(draggedId);
    if (targetId) suppressActionClick(targetId);
    if (!draggedId || !targetId) return;

    updateActions(reorderTitlebarActions(actions, draggedId, targetId));
  };
  const handleDragCancel = () => {
    const draggedId = draggingActionIdRef.current;
    draggingActionIdRef.current = null;
    if (draggedId) suppressActionClick(draggedId);
  };
  const handleClick = (id: TitlebarActionId, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (suppressActionClickIdsRef.current.has(id)) {
      suppressActionClickIdsRef.current.delete(id);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    toggleAction(id);
  };

  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="group"
      aria-label={translate("settings.editor.titlebarActions")}
    >
      <div className="inline-flex h-8 items-center gap-1 rounded-md border border-(--border-default) bg-(--bg-primary) p-0.5">
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          <SortableContext items={actionIds} strategy={horizontalListSortingStrategy}>
            {actions.map((action) => {
              const option = titlebarActionOption(action.id);
              const Icon = option.icon;
              const label = translate(option.labelKey);

              return (
                <SortableTitlebarAction key={action.id} id={action.id}>
                  {(sortable) => (
                    <span
                      className={sortable.itemClassName}
                      data-titlebar-action={action.id}
                      ref={sortable.setItemRef}
                      style={sortable.itemStyle}
                    >
                      <IconButton
                        className={mergeClassNames(
                          titlebarActionVisibleClassName,
                          action.visible ? "" : titlebarActionHiddenClassName,
                          sortable.actionClassName
                        )}
                        data-visible={action.visible ? "true" : "false"}
                        label={label}
                        pressed={action.visible}
                        title={label}
                        size="icon-xs"
                        onClick={(event) => handleClick(action.id, event)}
                        {...sortable.actionAttributes}
                        {...sortable.actionListeners}
                      >
                        <Icon aria-hidden="true" size={13} />
                      </IconButton>
                    </span>
                  )}
                </SortableTitlebarAction>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
      <SettingsButton
        label={translate("settings.editor.titlebarActionsReset")}
        onClick={() => updateActions(defaultTitlebarActions.map((action) => ({ ...action })))}
      >
        <RotateCcw aria-hidden="true" size={13} />
        {translate("settings.editor.shortcutsReset")}
      </SettingsButton>
    </div>
  );
}

export function GeneralSettings({
  appVersion,
  language,
  onCheckForUpdates,
  onResetWelcomeDocument,
  onSelectLanguage,
  onUpdatePreferences,
  preferences,
  translate,
  welcomeReset
}: {
  appVersion: string;
  language: AppLanguage;
  onCheckForUpdates: () => unknown;
  onResetWelcomeDocument: () => unknown;
  onSelectLanguage: (language: AppLanguage) => unknown;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
  welcomeReset: boolean;
}) {
  return (
    <>
      <SettingsSection label={translate("settings.sections.language")}>
        <SettingsRow
          title={translate("settings.language.title")}
          description={translate("settings.language.description")}
          action={
            <LanguageSelect
              language={language}
              label={translate("settings.language.title")}
              onSelectLanguage={onSelectLanguage}
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.startup")}>
        <SettingsRow
          title={translate("settings.startup.restoreWorkspace")}
          description={translate("settings.startup.restoreWorkspaceDescription")}
          action={
            <SettingsSwitch
              checked={preferences.restoreWorkspaceOnStartup}
              label={translate("settings.startup.restoreWorkspace")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  restoreWorkspaceOnStartup: !preferences.restoreWorkspaceOnStartup
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.welcome.title")}
          description={translate("settings.welcome.description")}
          action={
            <SettingsButton label={translate("settings.welcome.buttonLabel")} onClick={onResetWelcomeDocument}>
              <RotateCcw aria-hidden="true" size={13} />
              {translate("settings.welcome.button")}
            </SettingsButton>
          }
        />
      </SettingsSection>

      {welcomeReset ? (
        <p className="-mt-6 mb-8 text-[12px] leading-5 text-(--accent)" role="status">
          {translate("settings.welcome.status")}
        </p>
      ) : null}

      <SettingsSection label={translate("settings.sections.updates")}>
        <SettingsRow
          title={translate("settings.update.currentVersion")}
          description={`Markra ${appVersion}`}
        />
        <SettingsRow
          title={translate("settings.update.title")}
          description={translate("settings.update.description")}
          action={
            <SettingsButton label={translate("settings.update.check")} onClick={onCheckForUpdates}>
              <RefreshCw aria-hidden="true" size={13} />
              {translate("settings.update.check")}
            </SettingsButton>
          }
        />
      </SettingsSection>
    </>
  );
}

export function AppearanceSettings({
  customThemeCss,
  onSelectTheme,
  onUpdateCustomThemeCss,
  selectedTheme,
  translate
}: {
  customThemeCss: string;
  onSelectTheme: (theme: AppTheme) => unknown;
  onUpdateCustomThemeCss: (css: string) => unknown;
  selectedTheme: AppTheme;
  translate: Translate;
}) {
  return (
    <SettingsSection label={translate("settings.sections.theme")}>
      <SettingsRow
        title={translate("settings.theme.colorTitle")}
        description={translate("settings.theme.description")}
        action={
          <SettingsSelect
            label={translate("settings.theme.colorTitle")}
            value={selectedTheme}
            options={appThemeOptions.map((theme) => ({
              label: translate(themeLabelKeys[theme]),
              value: theme
            }))}
            onChange={(value) => onSelectTheme(value as AppTheme)}
          />
        }
      />
      <SettingsRow
        title={translate("settings.theme.previewTitle")}
        description={translate("settings.theme.previewDescription")}
        action={
          <ThemePreviewGrid
            selectedTheme={selectedTheme}
            translate={translate}
            onSelectTheme={onSelectTheme}
          />
        }
      />
      {selectedTheme === "custom" ? (
        <SettingsRow
          title={translate("settings.theme.customCssTitle")}
          description={translate("settings.theme.customCssDescription")}
          action={
            <CustomThemeCssControl
              customThemeCss={customThemeCss}
              translate={translate}
              onUpdateCustomThemeCss={onUpdateCustomThemeCss}
            />
          }
        />
      ) : null}
    </SettingsSection>
  );
}

export function StorageSettings({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  const imageUpload = preferences.imageUpload;
  const [settingsProvider, setSettingsProvider] = useState<ImageUploadProvider>(imageUpload.provider);
  useEffect(() => {
    setSettingsProvider(imageUpload.provider);
  }, [imageUpload.provider]);

  const updateWebDavImageUpload = (patch: Partial<typeof imageUpload.webdav>) => {
    onUpdatePreferences({
      ...preferences,
      imageUpload: {
        ...imageUpload,
        webdav: {
          ...imageUpload.webdav,
          ...patch
        }
      }
    });
  };
  const updateS3ImageUpload = (patch: Partial<typeof imageUpload.s3>) => {
    onUpdatePreferences({
      ...preferences,
      imageUpload: {
        ...imageUpload,
        s3: {
          ...imageUpload.s3,
          ...patch
        }
      }
    });
  };

  return (
    <SettingsSection label={translate("settings.categories.storage")}>
      <SettingsRow
        title={translate("settings.editor.imageUploadProviderSettings")}
        description={translate("settings.editor.imageUploadProviderStorageHint")}
        action={
          <ImageUploadProviderSettingsControl
            provider={settingsProvider}
            translate={translate}
            onSelectProvider={setSettingsProvider}
          />
        }
      />
      <SettingsRow
        title={translate("settings.editor.imageUploadFileNamePattern")}
        description={translate("settings.editor.imageUploadFileNamePatternDescription")}
        action={
          <SettingsTextInput
            label={translate("settings.editor.imageUploadFileNamePattern")}
            value={imageUpload.fileNamePattern}
            placeholder="pasted-image-{timestamp}"
            widthClassName="w-64"
            onChange={(fileNamePattern) =>
              onUpdatePreferences({
                ...preferences,
                imageUpload: {
                  ...imageUpload,
                  fileNamePattern
                }
              })
            }
          />
        }
      />
      {settingsProvider === "local" ? (
        <SettingsRow
          title={translate("settings.editor.clipboardImageFolder")}
          description={translate("settings.editor.clipboardImageFolderDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.editor.clipboardImageFolder")}
              value={preferences.clipboardImageFolder}
              placeholder="assets"
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  clipboardImageFolder: value
                })
              }
            />
          }
        />
      ) : null}
      {settingsProvider === "webdav" ? (
        <>
          <SettingsRow
            title={translate("settings.editor.webDavServerUrl")}
            description={translate("settings.editor.webDavServerUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavServerUrl")}
                value={imageUpload.webdav.serverUrl}
                placeholder="https://dav.example.com/images"
                widthClassName="w-72"
                onChange={(serverUrl) => updateWebDavImageUpload({ serverUrl })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavUsername")}
            description={translate("settings.editor.webDavUsernameDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavUsername")}
                value={imageUpload.webdav.username}
                widthClassName="w-56"
                onChange={(username) => updateWebDavImageUpload({ username })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavPassword")}
            description={translate("settings.editor.webDavPasswordDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavPassword")}
                value={imageUpload.webdav.password}
                type="password"
                widthClassName="w-56"
                onChange={(password) => updateWebDavImageUpload({ password })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavUploadPath")}
            description={translate("settings.editor.webDavUploadPathDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavUploadPath")}
                value={imageUpload.webdav.uploadPath}
                placeholder="notes"
                widthClassName="w-56"
                onChange={(uploadPath) => updateWebDavImageUpload({ uploadPath })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.webDavPublicBaseUrl")}
            description={translate("settings.editor.webDavPublicBaseUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.webDavPublicBaseUrl")}
                value={imageUpload.webdav.publicBaseUrl}
                placeholder="https://cdn.example.com/images"
                widthClassName="w-72"
                onChange={(publicBaseUrl) => updateWebDavImageUpload({ publicBaseUrl })}
              />
            }
          />
        </>
      ) : null}
      {settingsProvider === "s3" ? (
        <>
          <SettingsRow
            title={translate("settings.editor.s3EndpointUrl")}
            description={translate("settings.editor.s3EndpointUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3EndpointUrl")}
                value={imageUpload.s3.endpointUrl}
                placeholder="https://s3.example.com"
                widthClassName="w-72"
                onChange={(endpointUrl) => updateS3ImageUpload({ endpointUrl })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3Region")}
            description={translate("settings.editor.s3RegionDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3Region")}
                value={imageUpload.s3.region}
                placeholder="us-east-1"
                widthClassName="w-44"
                onChange={(region) => updateS3ImageUpload({ region })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3Bucket")}
            description={translate("settings.editor.s3BucketDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3Bucket")}
                value={imageUpload.s3.bucket}
                placeholder="markra-images"
                widthClassName="w-56"
                onChange={(bucket) => updateS3ImageUpload({ bucket })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3AccessKeyId")}
            description={translate("settings.editor.s3AccessKeyIdDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3AccessKeyId")}
                value={imageUpload.s3.accessKeyId}
                widthClassName="w-56"
                onChange={(accessKeyId) => updateS3ImageUpload({ accessKeyId })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3SecretAccessKey")}
            description={translate("settings.editor.s3SecretAccessKeyDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3SecretAccessKey")}
                value={imageUpload.s3.secretAccessKey}
                type="password"
                widthClassName="w-56"
                onChange={(secretAccessKey) => updateS3ImageUpload({ secretAccessKey })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3UploadPath")}
            description={translate("settings.editor.s3UploadPathDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3UploadPath")}
                value={imageUpload.s3.uploadPath}
                placeholder="notes"
                widthClassName="w-56"
                onChange={(uploadPath) => updateS3ImageUpload({ uploadPath })}
              />
            }
          />
          <SettingsRow
            title={translate("settings.editor.s3PublicBaseUrl")}
            description={translate("settings.editor.s3PublicBaseUrlDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.editor.s3PublicBaseUrl")}
                value={imageUpload.s3.publicBaseUrl}
                placeholder="https://cdn.example.com/images"
                widthClassName="w-72"
                onChange={(publicBaseUrl) => updateS3ImageUpload({ publicBaseUrl })}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
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
  translate: Translate;
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
  onUpdatePreferences,
  platform = "macos",
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  platform?: DesktopPlatform;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  const [activeAction, setActiveAction] = useState<MarkdownShortcutAction | null>(null);
  const shortcuts = useMemo(
    () => normalizeMarkdownShortcuts(preferences.markdownShortcuts),
    [preferences.markdownShortcuts]
  );

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
      onUpdatePreferences({
        ...preferences,
        markdownShortcuts: normalizeMarkdownShortcuts({
          ...shortcuts,
          [activeAction]: nextShortcut
        })
      });
      setActiveAction(null);
    };

    window.addEventListener("keydown", handleShortcutCapture, true);

    return () => {
      window.removeEventListener("keydown", handleShortcutCapture, true);
    };
  }, [activeAction, onUpdatePreferences, preferences, shortcuts]);

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
        {keyboardShortcutSections.map((section) => (
          <div key={section.labelKey} className="py-4 first:pt-3 last:pb-4">
            <h4 className="m-0 mb-3 text-[12px] leading-5 font-[700] tracking-normal text-(--text-secondary)">
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
      </div>
    </SettingsSection>
  );
}

function aiPromptInputLabel(actionId: AiQuickActionId, translate: Translate) {
  return `${translate(aiQuickActionLabelKeys[actionId])} ${translate("settings.ai.prompt")}`;
}

function updateAiQuickActionPrompt(
  preferences: EditorPreferences,
  actionId: AiQuickActionId,
  prompt: string
): EditorPreferences {
  return {
    ...preferences,
    aiQuickActionPrompts: {
      ...(preferences.aiQuickActionPrompts ?? defaultAiQuickActionPrompts),
      [actionId]: prompt
    }
  };
}

export function AiSettings({
  language,
  onUpdatePreferences,
  preferences,
  translate
}: {
  language: AppLanguage;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  const quickActionPrompts = preferences.aiQuickActionPrompts ?? defaultAiQuickActionPrompts;
  const translationTargetLanguage = aiTranslationLanguageName(language);

  return (
    <>
      <SettingsSection label={translate("settings.sections.aiAssistance")}>
        <SettingsRow
          title={translate("settings.editor.autoOpenAiOnSelection")}
          description={translate("settings.editor.autoOpenAiOnSelectionDescription")}
          action={
            <SettingsSwitch
              checked={preferences.autoOpenAiOnSelection}
              label={translate("settings.editor.autoOpenAiOnSelection")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  autoOpenAiOnSelection: !preferences.autoOpenAiOnSelection
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.aiSelectionDisplayMode")}
          description={translate("settings.editor.aiSelectionDisplayModeDescription")}
          action={
            <AiSelectionDisplayModeControl
              mode={preferences.aiSelectionDisplayMode}
              translate={translate}
              onSelectMode={(mode) =>
                onUpdatePreferences({
                  ...preferences,
                  aiSelectionDisplayMode: mode
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.closeAiCommandOnAgentPanelOpen")}
          description={translate("settings.editor.closeAiCommandOnAgentPanelOpenDescription")}
          action={
            <SettingsSwitch
              checked={preferences.closeAiCommandOnAgentPanelOpen}
              label={translate("settings.editor.closeAiCommandOnAgentPanelOpen")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  closeAiCommandOnAgentPanelOpen: !preferences.closeAiCommandOnAgentPanelOpen
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.suggestAiPanelForComplexInlinePrompts")}
          description={translate("settings.editor.suggestAiPanelForComplexInlinePromptsDescription")}
          action={
            <SettingsSwitch
              checked={preferences.suggestAiPanelForComplexInlinePrompts}
              label={translate("settings.editor.suggestAiPanelForComplexInlinePrompts")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  suggestAiPanelForComplexInlinePrompts: !preferences.suggestAiPanelForComplexInlinePrompts
                })
              }
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.aiPrompts")}>
        {aiQuickActionIds.map((actionId) => {
          const actionLabel = translate(aiQuickActionLabelKeys[actionId]);
          const defaultPrompt = defaultAiQuickActionPrompt(actionId, translationTargetLanguage);
          const inputLabel = aiPromptInputLabel(actionId, translate);
          const storedPrompt = quickActionPrompts[actionId];

          return (
            <SettingsRow
              key={actionId}
              title={actionLabel}
              description={translate("settings.ai.promptDescription")}
              action={
                <div className="flex flex-col items-end gap-2 max-[760px]:w-full">
                  <SettingsTextarea
                    label={inputLabel}
                    value={storedPrompt || defaultPrompt}
                    onChange={(prompt) => onUpdatePreferences(updateAiQuickActionPrompt(preferences, actionId, prompt))}
                  />
                  <SettingsButton
                    label={`${translate("settings.ai.promptReset")} ${inputLabel}`}
                    onClick={() =>
                      onUpdatePreferences(updateAiQuickActionPrompt(preferences, actionId, defaultAiQuickActionPrompts[actionId]))
                    }
                  >
                    <RotateCcw aria-hidden="true" size={13} />
                    {translate("settings.ai.promptReset")}
                  </SettingsButton>
                </div>
              }
            />
          );
        })}
      </SettingsSection>
    </>
  );
}

export function EditorSettings({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: Translate;
}) {
  return (
    <>
      <SettingsSection label={translate("settings.sections.editing")}>
        <SettingsRow
          title={translate("settings.editor.bodyFontSize")}
          description={translate("settings.editor.bodyFontSizeDescription")}
          action={
            <SettingsSelect
              label={translate("settings.editor.bodyFontSize")}
              value={String(preferences.bodyFontSize)}
              options={bodyFontSizeOptions.map((size) => ({ label: `${size}px`, value: String(size) }))}
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  bodyFontSize: Number(value)
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.lineHeight")}
          description={translate("settings.editor.lineHeightDescription")}
          action={
            <SettingsSelect
              label={translate("settings.editor.lineHeight")}
              value={String(preferences.lineHeight)}
              options={lineHeightOptions.map((height) => ({ label: String(height), value: String(height) }))}
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  lineHeight: Number(value)
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.contentWidth")}
          description={translate("settings.editor.contentWidthDescription")}
          action={
            <SettingsContentWidthInput
              label={translate("settings.editor.contentWidth")}
              preferences={preferences}
              resetLabel={`${translate("settings.editor.contentWidth")} ${translate("settings.editor.shortcutsReset")}`}
              onUpdatePreferences={onUpdatePreferences}
            />
          }
        />
        <StorageTypeControlRow
          preferences={preferences}
          translate={translate}
          onUpdatePreferences={onUpdatePreferences}
        />
        <SettingsRow
          title={translate("settings.editor.titlebarActions")}
          description={translate("settings.editor.titlebarActionsDescription")}
          action={
            <SettingsTitlebarActionsControl
              preferences={preferences}
              translate={translate}
              onUpdatePreferences={onUpdatePreferences}
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.showDocumentTabs")}
          description={translate("settings.editor.showDocumentTabsDescription")}
          action={
            <SettingsSwitch
              checked={preferences.showDocumentTabs}
              label={translate("settings.editor.showDocumentTabs")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  showDocumentTabs: !preferences.showDocumentTabs
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.showWordCount")}
          description={translate("settings.editor.showWordCountDescription")}
          action={
            <SettingsSwitch
              checked={preferences.showWordCount}
              label={translate("settings.editor.showWordCount")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  showWordCount: !preferences.showWordCount
                })
              }
            />
          }
        />
      </SettingsSection>
    </>
  );
}

export function ExportSettings({
  onUpdateSettings,
  settings,
  translate
}: {
  onUpdateSettings: (settings: ExportSettingsValue) => unknown;
  settings: ExportSettingsValue;
  translate: Translate;
}) {
  return (
    <>
      <SettingsSection label={translate("settings.sections.pdfExport")}>
        <SettingsRow
          title={translate("settings.export.pageSize")}
          description={translate("settings.export.pageSizeDescription")}
          action={
            <SettingsSelect
              label={translate("settings.export.pageSize")}
              value={settings.pdfPageSize}
              options={exportPageSizeOptions.map((pageSize) => ({
                label: translate(exportPageSizeLabelKey(pageSize)),
                value: pageSize
              }))}
              onChange={(value) => onUpdateSettings(applyExportPageSize(settings, value as PdfPageSize))}
            />
          }
        />
        <SettingsRow
          title={translate("settings.export.pageMargin")}
          description={translate("settings.export.pageMarginDescription")}
          action={
            <SettingsSelect
              label={translate("settings.export.pageMargin")}
              value={settings.pdfMarginPreset}
              options={exportMarginPresetOptions.map((preset) => ({
                label: translate(exportMarginPresetLabelKey(preset)),
                value: preset
              }))}
              onChange={(value) => onUpdateSettings(applyExportMarginPreset(settings, value as PdfMarginPreset))}
            />
          }
        />
        {settings.pdfMarginPreset === "custom" ? (
          <SettingsRow
            title={translate("settings.export.pdfMargin")}
            description={translate("settings.export.pdfMarginDescription")}
            action={
              <SettingsNumberInput
                label={translate("settings.export.pdfMargin")}
                min={0}
                max={60}
                unit={translate("settings.export.pdfMarginUnit")}
                value={settings.pdfMarginMm}
                onChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    pdfMarginMm: value,
                    pdfMarginPreset: "custom"
                  })
                }
              />
            }
          />
        ) : null}
        <SettingsRow
          title={translate("settings.export.pageDimensions")}
          description={translate("settings.export.pageDimensionsDescription")}
          action={
            <div className="inline-flex items-center gap-2">
              <SettingsNumberInput
                label={translate("settings.export.pageWidth")}
                min={50}
                max={2000}
                unit={translate("settings.export.pdfMarginUnit")}
                value={settings.pdfWidthMm}
                onChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    pdfPageSize: "custom",
                    pdfWidthMm: value
                  })
                }
              />
              <span className="text-[12px] leading-5 font-[560] text-(--text-secondary)" aria-hidden="true">x</span>
              <SettingsNumberInput
                label={translate("settings.export.pageHeight")}
                min={50}
                max={2000}
                unit={translate("settings.export.pdfMarginUnit")}
                value={settings.pdfHeightMm}
                onChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    pdfHeightMm: value,
                    pdfPageSize: "custom"
                  })
                }
              />
            </div>
          }
        />
        <SettingsRow
          title={translate("settings.export.pageBreakOnH1")}
          description={translate("settings.export.pageBreakOnH1Description")}
          action={
            <SettingsCheckbox
              checked={settings.pdfPageBreakOnH1}
              label={translate("settings.export.pageBreakOnH1")}
              onChange={() =>
                onUpdateSettings({
                  ...settings,
                  pdfPageBreakOnH1: !settings.pdfPageBreakOnH1
                })
              }
            />
          }
        />
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.pdfMetadata")}>
        <SettingsRow
          title={translate("settings.export.header")}
          description={translate("settings.export.headerDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.export.header")}
              value={settings.pdfHeader}
              widthClassName="w-64"
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  pdfHeader: value
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.export.footer")}
          description={translate("settings.export.footerDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.export.footer")}
              value={settings.pdfFooter}
              widthClassName="w-64"
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  pdfFooter: value
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.export.author")}
          description={translate("settings.export.authorDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.export.author")}
              value={settings.pdfAuthor}
              widthClassName="w-64"
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  pdfAuthor: value
                })
              }
            />
          }
        />
      </SettingsSection>
    </>
  );
}

export function WebSearchSettings({
  onUpdateSettings,
  settings,
  translate
}: {
  onUpdateSettings: (settings: WebSearchSettings) => unknown;
  settings: WebSearchSettings;
  translate: Translate;
}) {
  return (
    <>
      <SettingsSection label={translate("settings.sections.webSearch")}>
        <SettingsRow
          title={translate("settings.webSearch.enable")}
          description={translate("settings.webSearch.enableDescription")}
          action={
            <SettingsSwitch
              checked={settings.enabled}
              label={translate("settings.webSearch.enable")}
              onChange={() =>
                onUpdateSettings({
                  ...settings,
                  enabled: !settings.enabled
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.webSearch.provider")}
          description={translate("settings.webSearch.providerDescription")}
          action={
            <SettingsSelect
              label={translate("settings.webSearch.provider")}
              value={settings.providerId}
              options={webSearchProviderOptions.map((providerId) => ({
                label: translate(providerId === "local-bing" ? "settings.webSearch.provider.localBing" : "settings.webSearch.provider.searxng"),
                value: providerId
              }))}
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  providerId: value === "searxng" ? "searxng" : "local-bing"
                })
              }
            />
          }
        />
        {settings.providerId === "searxng" ? (
          <SettingsRow
            title={translate("settings.webSearch.searxngApiHost")}
            description={translate("settings.webSearch.searxngApiHostDescription")}
            action={
              <SettingsTextInput
                label={translate("settings.webSearch.searxngApiHost")}
                value={settings.searxngApiHost}
                placeholder="http://localhost:8888"
                onChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    searxngApiHost: value
                  })
                }
              />
            }
          />
        ) : null}
      </SettingsSection>

      <SettingsSection label={translate("settings.sections.webSearchLimits")}>
        <SettingsRow
          title={translate("settings.webSearch.maxResults")}
          description={translate("settings.webSearch.maxResultsDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.webSearch.maxResults")}
              value={String(settings.maxResults)}
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  maxResults: Number(value)
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.webSearch.contentMaxChars")}
          description={translate("settings.webSearch.contentMaxCharsDescription")}
          action={
            <SettingsTextInput
              label={translate("settings.webSearch.contentMaxChars")}
              value={String(settings.contentMaxChars)}
              onChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  contentMaxChars: Number(value)
                })
              }
            />
          }
        />
      </SettingsSection>
    </>
  );
}
