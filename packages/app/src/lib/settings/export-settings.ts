export type PdfMarginPreset = "custom" | "default" | "narrow" | "none" | "normal" | "wide";
export type PdfPageSize = "a4" | "custom" | "default" | "letter";

export type ExportSettings = {
  pandocArgs: string;
  pandocPath: string;
  pdfAuthor: string;
  pdfFooter: string;
  pdfHeader: string;
  pdfHeightMm: number;
  pdfMarginMm: number;
  pdfMarginPreset: PdfMarginPreset;
  pdfPageBreakOnH1: boolean;
  pdfPageSize: PdfPageSize;
  pdfWidthMm: number;
};

export const defaultExportSettings: ExportSettings = {
  pandocArgs: "",
  pandocPath: "",
  pdfAuthor: "",
  pdfFooter: "",
  pdfHeader: "",
  pdfHeightMm: 297,
  pdfMarginMm: 18,
  pdfMarginPreset: "default",
  pdfPageBreakOnH1: false,
  pdfPageSize: "default",
  pdfWidthMm: 210
};

const exportPageSizeOptions: PdfPageSize[] = ["default", "a4", "letter", "custom"];
const exportMarginPresetOptions: PdfMarginPreset[] = ["default", "none", "narrow", "normal", "wide", "custom"];
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

export function normalizeExportSettings(value: unknown): ExportSettings {
  if (typeof value !== "object" || value === null) return defaultExportSettings;

  const settings = value as Partial<ExportSettings>;
  const pdfPageSize = exportPageSizeOptions.includes(settings.pdfPageSize as PdfPageSize)
    ? (settings.pdfPageSize as PdfPageSize)
    : defaultExportSettings.pdfPageSize;
  const pdfMarginMm = normalizeExportMarginMm(settings.pdfMarginMm);
  const pdfMarginPreset = normalizeExportMarginPreset(settings.pdfMarginPreset, pdfMarginMm);
  const dimensions = pdfPageSize === "custom"
    ? {
        heightMm: normalizeExportPageDimension(settings.pdfHeightMm, defaultExportSettings.pdfHeightMm),
        widthMm: normalizeExportPageDimension(settings.pdfWidthMm, defaultExportSettings.pdfWidthMm)
      }
    : exportPageSizeDimensions[pdfPageSize];

  return {
    pandocArgs: normalizeExportText(settings.pandocArgs, 1000),
    pandocPath: normalizeExportText(settings.pandocPath, 500),
    pdfAuthor: normalizeExportText(settings.pdfAuthor),
    pdfFooter: normalizeExportText(settings.pdfFooter),
    pdfHeader: normalizeExportText(settings.pdfHeader),
    pdfHeightMm: dimensions.heightMm,
    pdfMarginMm: pdfMarginPreset === "custom" ? pdfMarginMm : exportMarginPresetMm[pdfMarginPreset],
    pdfMarginPreset,
    pdfPageBreakOnH1: typeof settings.pdfPageBreakOnH1 === "boolean" ? settings.pdfPageBreakOnH1 : false,
    pdfPageSize,
    pdfWidthMm: dimensions.widthMm
  };
}

function normalizeExportMarginMm(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultExportSettings.pdfMarginMm;

  return Math.min(Math.max(Math.round(value), 0), 60);
}

function normalizeExportMarginPreset(value: unknown, marginMm: number): PdfMarginPreset {
  if (exportMarginPresetOptions.includes(value as PdfMarginPreset)) {
    return value as PdfMarginPreset;
  }

  return marginMm === defaultExportSettings.pdfMarginMm ? "default" : "custom";
}

function normalizeExportPageDimension(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;

  return Math.min(Math.max(Math.round(value), 50), 2000);
}

function normalizeExportText(value: unknown, maxLength = 200) {
  if (typeof value !== "string") return "";

  return value.trim().slice(0, maxLength);
}
