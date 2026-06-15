import { RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  type ExportSettings as ExportSettingsValue,
  type PdfMarginPreset,
  type PdfPageSize
} from "../../lib/settings/app-settings";
import type { I18nKey } from "@markra/shared";
import {
  SettingsButton,
  SettingsCheckbox,
  SettingsNumberInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsTextarea,
  SettingsTextInput
} from "./SettingsControls";
import type { SettingsTranslate } from "./translate";

const exportMarginPresetOptions: PdfMarginPreset[] = ["default", "none", "narrow", "normal", "wide", "custom"];
const exportPageSizeOptions: PdfPageSize[] = ["default", "a4", "letter", "custom"];

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

export function ExportSettings({
  focusTarget = null,
  onDetectPandocPath,
  onFocusTargetHandled,
  onUpdateSettings,
  pandocEnabled = true,
  settings,
  translate
}: {
  focusTarget?: "pandocPath" | null;
  onDetectPandocPath?: () => unknown;
  onFocusTargetHandled?: () => unknown;
  onUpdateSettings: (settings: ExportSettingsValue) => unknown;
  pandocEnabled?: boolean;
  settings: ExportSettingsValue;
  translate: SettingsTranslate;
}) {
  const pandocPathTargetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusTarget !== "pandocPath" || !pandocEnabled) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const target = pandocPathTargetRef.current;
      target?.scrollIntoView?.({ block: "center" });
      target?.querySelector<HTMLInputElement>("input")?.focus();
      onFocusTargetHandled?.();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [focusTarget, onFocusTargetHandled, pandocEnabled]);

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

      {pandocEnabled ? (
        <SettingsSection label={translate("settings.sections.pandocExport")}>
          <div ref={pandocPathTargetRef} data-settings-target="pandocPath">
            <SettingsRow
              title={translate("settings.export.pandocPath")}
              description={translate("settings.export.pandocPathDescription")}
              action={
                <div className="inline-flex items-center gap-2 max-[760px]:w-full max-[760px]:flex-wrap">
                  <SettingsTextInput
                    label={translate("settings.export.pandocPath")}
                    value={settings.pandocPath}
                    widthClassName="w-80 max-[760px]:w-full"
                    onChange={(value) =>
                      onUpdateSettings({
                        ...settings,
                        pandocPath: value
                      })
                    }
                  />
                  <SettingsButton
                    label={translate("settings.export.detectPandocPath")}
                    onClick={() => onDetectPandocPath?.()}
                  >
                    <RefreshCw aria-hidden="true" size={13} />
                    <span>{translate("settings.export.detectPandocPath")}</span>
                  </SettingsButton>
                </div>
              }
            />
          </div>
          <SettingsRow
            title={translate("settings.export.pandocArgs")}
            description={translate("settings.export.pandocArgsDescription")}
            action={
              <SettingsTextarea
                label={translate("settings.export.pandocArgs")}
                value={settings.pandocArgs}
                widthClassName="w-80"
                spellCheck={false}
                onChange={(value) =>
                  onUpdateSettings({
                    ...settings,
                    pandocArgs: value
                  })
                }
              />
            }
          />
        </SettingsSection>
      ) : null}
    </>
  );
}
