import {
  Bot,
  Code2,
  Focus,
  History,
  Moon,
  RotateCcw,
  Save,
  Search,
  type LucideIcon
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
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
import { IconButton, SegmentedControl, SegmentedControlItem, Tooltip } from "@markra/ui";
import { clampNumber, type I18nKey } from "@markra/shared";
import {
  defaultTitlebarActions,
  editorParagraphSpacingPxMax,
  editorParagraphSpacingPxMin,
  reorderTitlebarActions,
  type EditorPreferences,
  type SidebarLayoutMode,
  type TitlebarActionId,
  type TitlebarActionPreference
} from "../../lib/settings/app-settings";
import {
  editorContentWidthPixels,
  editorCustomContentWidthMax,
  editorCustomContentWidthMin,
  normalizeEditorContentWidthPx
} from "../../lib/editor-width";
import {
  editorFontFamilyCssValue,
  normalizeSystemFontFamilyName
} from "../../lib/editor-font";
import type { AppSystemFontFamily } from "../../runtime";
import { SortableTitlebarAction } from "../SortableTitlebarAction";
import {
  SettingsButton,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch
} from "./SettingsControls";
import {
  ImageUploadProviderControl,
  availableImageUploadProvider
} from "./ImageUploadControls";
import { mergeClassNames } from "./class-names";
import type { SettingsTranslate } from "./translate";

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
    icon: Focus,
    id: "viewMode",
    labelKey: "settings.editor.viewMode"
  },
  {
    icon: Code2,
    id: "sourceMode",
    labelKey: "app.editorViewMode"
  },
  {
    icon: History,
    id: "history",
    labelKey: "app.showDocumentHistory"
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

function titlebarActionAvailable(id: TitlebarActionId, aiEnabled: boolean) {
  return aiEnabled || id !== "aiAgent";
}

const bodyFontSizeOptions = [14, 15, 16, 17, 18, 20];
const contentWidthRatioSpanPx = editorCustomContentWidthMax - editorCustomContentWidthMin;
const contentWidthRatioMin = 0;
const contentWidthRatioMax = 100;
const titlebarActionDragThresholdPx = 4;
const lineHeightOptions = [1.5, 1.65, 1.8];
const sidebarLayoutOptions: Array<{
  labelKey: I18nKey;
  value: SidebarLayoutMode;
}> = [
  {
    labelKey: "settings.editor.sidebarLayoutMode.stacked",
    value: "stacked"
  },
  {
    labelKey: "settings.editor.sidebarLayoutMode.tabs",
    value: "tabs"
  }
];
const titlebarActionVisibleClassName =
  "aria-pressed:border-transparent aria-pressed:bg-(--bg-active) aria-pressed:text-(--text-heading) aria-pressed:opacity-100 aria-pressed:hover:bg-(--bg-active)";
const titlebarActionHiddenClassName = "text-(--text-secondary) opacity-55 hover:opacity-100";
const editorFontFamilyListboxId = "settings-editor-font-family-options";

type EditorFontFamilySelectOption = {
  fontFamily: string | null;
  label: string;
};

function contentWidthRatioValue(preferences: EditorPreferences) {
  const contentWidthPx = preferences.contentWidthPx ?? editorContentWidthPixels[preferences.contentWidth];

  return Math.round(((contentWidthPx - editorCustomContentWidthMin) / contentWidthRatioSpanPx) * 100);
}

function contentWidthPxFromRatio(value: number) {
  const ratio = clampNumber(value, contentWidthRatioMin, contentWidthRatioMax);
  if (ratio === null) return null;

  return normalizeEditorContentWidthPx(Math.round(editorCustomContentWidthMin + (contentWidthRatioSpanPx * ratio) / 100));
}

function editorFontFamilySelectOptions(
  preferences: EditorPreferences,
  systemFontFamilies: readonly AppSystemFontFamily[],
  themeLabel: string
): EditorFontFamilySelectOption[] {
  const fontFamilyOptions = new Map<string, EditorFontFamilySelectOption>();
  for (const fontFamily of systemFontFamilies) {
    const normalizedFontFamily = normalizeSystemFontFamilyName(fontFamily.family);
    if (!normalizedFontFamily) continue;

    const normalizedLabel = normalizeSystemFontFamilyName(fontFamily.label) ?? normalizedFontFamily;
    if (!fontFamilyOptions.has(normalizedFontFamily)) {
      fontFamilyOptions.set(normalizedFontFamily, {
        fontFamily: normalizedFontFamily,
        label: normalizedLabel
      });
    }
  }
  if (fontFamilyOptions.size === 0 && preferences.editorFontFamily.source === "system") {
    fontFamilyOptions.set(preferences.editorFontFamily.family, {
      fontFamily: preferences.editorFontFamily.family,
      label: preferences.editorFontFamily.family
    });
  }

  return [
    { fontFamily: null, label: themeLabel },
    ...Array.from(fontFamilyOptions.values())
      .sort((first, second) => first.label.localeCompare(second.label) || first.fontFamily!.localeCompare(second.fontFamily!))
  ];
}

function optionMatchesQuery(option: EditorFontFamilySelectOption, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return option.label.toLocaleLowerCase().includes(normalizedQuery);
}

function selectedFontFamilyOption(options: readonly EditorFontFamilySelectOption[], preferences: EditorPreferences) {
  if (preferences.editorFontFamily.source === "theme") return options[0]!;

  return options.find((option) => option.fontFamily === preferences.editorFontFamily.family) ?? options[0]!;
}

function editorFontFamilyOptionStyle(option: EditorFontFamilySelectOption): CSSProperties | undefined {
  if (option.fontFamily === null) return undefined;

  return {
    fontFamily: editorFontFamilyCssValue({
      family: option.fontFamily,
      source: "system"
    }) ?? undefined
  };
}

function SearchableEditorFontFamilySelect({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (option: EditorFontFamilySelectOption) => unknown;
  options: EditorFontFamilySelectOption[];
  value: EditorFontFamilySelectOption;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputValue = open ? query : value.label;
  const inputStyle = open ? undefined : editorFontFamilyOptionStyle(value);
  const filteredOptions = useMemo(
    () => options.filter((option) => optionMatchesQuery(option, query)),
    [options, query]
  );
  const visibleOptions = filteredOptions;
  const activeOption = visibleOptions[activeIndex] ?? visibleOptions[0];

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  const selectOption = (option: EditorFontFamilySelectOption) => {
    setQuery("");
    setOpen(false);
    onChange(option);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (visibleOptions.length === 0) return;
      setActiveIndex((currentIndex) => Math.min(currentIndex + 1, visibleOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (visibleOptions.length === 0) return;
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative inline-flex min-w-56 items-center">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 z-10 text-(--text-secondary)"
        size={13}
      />
      <input
        className="h-8 w-56 rounded-md border border-(--border-default) bg-(--bg-primary) py-0 pr-3 pl-8 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        type="text"
        role="combobox"
        aria-activedescendant={open && activeOption ? `${editorFontFamilyListboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={editorFontFamilyListboxId}
        aria-expanded={open}
        aria-label={label}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={value.label}
        spellCheck={false}
        style={inputStyle}
        value={inputValue}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <div
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-md border border-(--border-default) bg-(--bg-primary) py-1 shadow-[0_12px_34px_rgba(0,0,0,0.14)]"
          id={editorFontFamilyListboxId}
          role="listbox"
        >
          {visibleOptions.map((option, index) => (
            <button
              key={option.fontFamily ?? "theme"}
              className="flex h-8 w-full cursor-pointer items-center border-0 bg-transparent px-3 text-left text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus:bg-(--bg-hover) focus:outline-none aria-selected:bg-(--bg-active)"
              id={`${editorFontFamilyListboxId}-${index}`}
              role="option"
              aria-selected={option.label === value.label}
              style={editorFontFamilyOptionStyle(option)}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="numeric"
          min={contentWidthRatioMin}
          max={contentWidthRatioMax}
          pattern="[0-9]*"
          spellCheck={false}
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
      <Tooltip content={resetLabel}>
        <button
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 border-l border-(--border-default) bg-transparent text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          type="button"
          aria-label={resetLabel}
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
      </Tooltip>
    </div>
  );
}

function StorageTypeControlRow({
  onUpdatePreferences,
  preferences,
  s3ImageUploadEnabled = true,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  s3ImageUploadEnabled?: boolean;
  translate: SettingsTranslate;
}) {
  const imageUpload = preferences.imageUpload;
  const activeProvider = availableImageUploadProvider(imageUpload.provider, s3ImageUploadEnabled);

  return (
    <SettingsRow
      title={translate("settings.editor.imageUploadProvider")}
      description={translate("settings.editor.imageUploadProviderDescription")}
      action={
        <ImageUploadProviderControl
          provider={activeProvider}
          s3ImageUploadEnabled={s3ImageUploadEnabled}
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

function SidebarLayoutModeControl({
  onUpdatePreferences,
  preferences,
  translate
}: {
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  return (
    <SegmentedControl className="grid-cols-2" label={translate("settings.editor.sidebarLayoutMode")}>
      {sidebarLayoutOptions.map((option) => (
        <SegmentedControlItem
          key={option.value}
          label={translate(option.labelKey)}
          selected={preferences.sidebarLayoutMode === option.value}
          onClick={() =>
            onUpdatePreferences({
              ...preferences,
              sidebarLayoutMode: option.value
            })
          }
        >
          {translate(option.labelKey)}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  );
}

function titlebarActionOption(id: TitlebarActionId) {
  return titlebarActionOptions.find((option) => option.id === id) ?? titlebarActionOptions[0]!;
}

function SettingsTitlebarActionsControl({
  aiEnabled = true,
  onUpdatePreferences,
  preferences,
  translate
}: {
  aiEnabled?: boolean;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  translate: SettingsTranslate;
}) {
  const actions = useMemo(
    () => preferences.titlebarActions.filter((action) => titlebarActionAvailable(action.id, aiEnabled)),
    [aiEnabled, preferences.titlebarActions]
  );
  const hiddenActions = useMemo(
    () => preferences.titlebarActions.filter((action) => !titlebarActionAvailable(action.id, aiEnabled)),
    [aiEnabled, preferences.titlebarActions]
  );
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
      titlebarActions: [...titlebarActions, ...hiddenActions]
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
                        tooltip={label}
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
        onClick={() => updateActions(defaultTitlebarActions
          .filter((action) => titlebarActionAvailable(action.id, aiEnabled))
          .map((action) => ({ ...action })))}
      >
        <RotateCcw aria-hidden="true" size={13} />
        {translate("settings.editor.shortcutsReset")}
      </SettingsButton>
    </div>
  );
}

export function EditorSettings({
  aiEnabled = true,
  onUpdatePreferences,
  preferences,
  s3ImageUploadEnabled = true,
  systemFontFamilies = [],
  translate
}: {
  aiEnabled?: boolean;
  onUpdatePreferences: (preferences: EditorPreferences) => unknown;
  preferences: EditorPreferences;
  s3ImageUploadEnabled?: boolean;
  systemFontFamilies?: readonly AppSystemFontFamily[];
  translate: SettingsTranslate;
}) {
  const editorFontFamilyOptions = editorFontFamilySelectOptions(
    preferences,
    systemFontFamilies,
    translate("settings.editor.fontFamily.theme")
  );
  const editorFontFamilyValue = selectedFontFamilyOption(editorFontFamilyOptions, preferences);

  return (
    <>
      <SettingsSection label={translate("settings.sections.editing")}>
        <SettingsRow
          title={translate("settings.editor.fontFamily")}
          description={translate("settings.editor.fontFamilyDescription")}
          action={
            <SearchableEditorFontFamilySelect
              label={translate("settings.editor.fontFamily")}
              value={editorFontFamilyValue}
              options={editorFontFamilyOptions}
              onChange={(option) =>
                onUpdatePreferences({
                  ...preferences,
                  editorFontFamily: option.fontFamily === null
                    ? { family: null, source: "theme" }
                    : { family: option.fontFamily, source: "system" }
                })
              }
            />
          }
        />
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
          title={translate("settings.editor.paragraphSpacing")}
          description={translate("settings.editor.paragraphSpacingDescription")}
          action={
            <SettingsNumberInput
              label={translate("settings.editor.paragraphSpacing")}
              min={editorParagraphSpacingPxMin}
              max={editorParagraphSpacingPxMax}
              unit="px"
              value={preferences.paragraphSpacingPx}
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  paragraphSpacingPx:
                    clampNumber(value, editorParagraphSpacingPxMin, editorParagraphSpacingPxMax) ??
                    preferences.paragraphSpacingPx
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
        <SettingsRow
          title={translate("settings.editor.tableColumnWidthMode")}
          description={translate("settings.editor.tableColumnWidthModeDescription")}
          action={
            <SettingsSelect
              label={translate("settings.editor.tableColumnWidthMode")}
              value={preferences.tableColumnWidthMode}
              options={[
                { label: translate("settings.editor.tableColumnWidthMode.even"), value: "even" },
                { label: translate("settings.editor.tableColumnWidthMode.auto"), value: "auto" }
              ]}
              onChange={(value) =>
                onUpdatePreferences({
                  ...preferences,
                  tableColumnWidthMode: value === "auto" ? "auto" : "even"
                })
              }
            />
          }
        />
        <StorageTypeControlRow
          preferences={preferences}
          s3ImageUploadEnabled={s3ImageUploadEnabled}
          translate={translate}
          onUpdatePreferences={onUpdatePreferences}
        />
        <SettingsRow
          title={translate("settings.editor.copyExternalFilesToStorage")}
          description={translate("settings.editor.copyExternalFilesToStorageDescription")}
          action={
            <SettingsSwitch
              checked={preferences.copyExternalFilesToStorage}
              label={translate("settings.editor.copyExternalFilesToStorage")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  copyExternalFilesToStorage: !preferences.copyExternalFilesToStorage
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.titlebarActions")}
          description={translate("settings.editor.titlebarActionsDescription")}
          action={
            <SettingsTitlebarActionsControl
              aiEnabled={aiEnabled}
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
          title={translate("settings.editor.autoRevealActiveFile")}
          description={translate("settings.editor.autoRevealActiveFileDescription")}
          action={
            <SettingsSwitch
              checked={preferences.autoRevealActiveFile}
              label={translate("settings.editor.autoRevealActiveFile")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  autoRevealActiveFile: !preferences.autoRevealActiveFile
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.sidebarLayoutMode")}
          description={translate("settings.editor.sidebarLayoutModeDescription")}
          action={
            <SidebarLayoutModeControl
              preferences={preferences}
              translate={translate}
              onUpdatePreferences={onUpdatePreferences}
            />
          }
        />
        <SettingsRow
          title={translate("app.documentLinks")}
          description={translate("settings.editor.documentLinksDescription")}
          action={
            <SettingsSwitch
              checked={preferences.documentLinksVisible}
              label={translate("app.documentLinks")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  documentLinksVisible: !preferences.documentLinksVisible
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.showLineNumbers")}
          description={translate("settings.editor.showLineNumbersDescription")}
          action={
            <SettingsSwitch
              checked={preferences.showLineNumbers}
              label={translate("settings.editor.showLineNumbers")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  showLineNumbers: !preferences.showLineNumbers
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
        <SettingsRow
          title={translate("settings.editor.wrapCodeBlocks")}
          description={translate("settings.editor.wrapCodeBlocksDescription")}
          action={
            <SettingsSwitch
              checked={preferences.wrapCodeBlocks}
              label={translate("settings.editor.wrapCodeBlocks")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  wrapCodeBlocks: !preferences.wrapCodeBlocks
                })
              }
            />
          }
        />
      </SettingsSection>
      <SettingsSection label={translate("settings.sections.extendedSyntax")}>
        <SettingsRow
          title={translate("settings.editor.highlightSyntax")}
          description={translate("settings.editor.highlightSyntaxDescription")}
          action={
            <SettingsSwitch
              checked={preferences.extendedSyntax.highlight}
              label={translate("settings.editor.highlightSyntax")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  extendedSyntax: {
                    ...preferences.extendedSyntax,
                    highlight: !preferences.extendedSyntax.highlight
                  }
                })
              }
            />
          }
        />
        <SettingsRow
          title={translate("settings.editor.githubAlerts")}
          description={translate("settings.editor.githubAlertsDescription")}
          action={
            <SettingsSwitch
              checked={preferences.extendedSyntax.githubAlerts}
              label={translate("settings.editor.githubAlerts")}
              onChange={() =>
                onUpdatePreferences({
                  ...preferences,
                  extendedSyntax: {
                    ...preferences.extendedSyntax,
                    githubAlerts: !preferences.extendedSyntax.githubAlerts
                  }
                })
              }
            />
          }
        />
      </SettingsSection>
    </>
  );
}
