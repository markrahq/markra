import { createRoot } from "react-dom/client";
import { QuickLookPreview } from "./QuickLookPreview";
import {
  applyQuickLookAppearance,
  normalizeQuickLookPayload,
  type QuickLookAppearance,
  type QuickLookPreviewPayload
} from "./payload";
import "./styles.css";

declare global {
  interface Window {
    __MARKRA_QUICKLOOK_PAYLOAD__?: unknown;
    __MARKRA_RENDER_QUICKLOOK__?: (payload: unknown) => boolean;
  }
}

const mountNode = document.getElementById("root");
if (!mountNode) throw new Error("Quick Look root element is unavailable");

const root = createRoot(mountNode);

function systemAppearance(): QuickLookAppearance {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function renderPayload(payload: QuickLookPreviewPayload | null) {
  if (payload) applyQuickLookAppearance(payload.appearance ?? systemAppearance());
  root.render(<QuickLookPreview payload={payload} />);
}

window.__MARKRA_RENDER_QUICKLOOK__ = (value) => {
  const payload = normalizeQuickLookPayload(value);
  if (!payload) throw new Error("Quick Look received an invalid Markdown payload");

  window.__MARKRA_QUICKLOOK_PAYLOAD__ = payload;
  renderPayload(payload);
  return true;
};

renderPayload(normalizeQuickLookPayload(window.__MARKRA_QUICKLOOK_PAYLOAD__));
