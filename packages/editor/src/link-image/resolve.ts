import type { EditorView } from "@milkdown/kit/prose/view";

export const resolvedImageSourcesRefreshEvent = "markra-refresh-resolved-image-sources";

export function refreshResolvedImageSources(view: EditorView) {
  // Refresh node views and live-preview decorations without replacing the editor instance.
  view.dom.dispatchEvent(new Event(resolvedImageSourcesRefreshEvent));
  view.dispatch(view.state.tr.setMeta(resolvedImageSourcesRefreshEvent, true));
}
