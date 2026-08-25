export const uiZoomPercentOptions = [60, 80, 100, 120, 140, 160, 180, 200] as const;
export const defaultUiZoomPercent = 100;

export function normalizeUiZoomPercent(value: unknown, fallback: unknown = defaultUiZoomPercent) {
  if (uiZoomPercentOptions.includes(value as typeof uiZoomPercentOptions[number])) {
    return Number(value);
  }
  if (uiZoomPercentOptions.includes(fallback as typeof uiZoomPercentOptions[number])) {
    return Number(fallback);
  }

  return defaultUiZoomPercent;
}
