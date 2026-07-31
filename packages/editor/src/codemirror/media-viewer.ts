const svgNamespace = "http://www.w3.org/2000/svg";

type MediaViewerIconName =
  | "close"
  | "enlarge"
  | "exit-fullscreen"
  | "fullscreen"
  | "reset"
  | "zoom-in"
  | "zoom-out";

type MediaViewerIconChild = {
  readonly attributes: Readonly<Record<string, string>>;
  readonly tag: "path" | "rect";
};

const mediaViewerIconChildren = {
  close: [
    { tag: "path", attributes: { d: "M18 6 6 18" } },
    { tag: "path", attributes: { d: "m6 6 12 12" } },
  ],
  enlarge: [
    { tag: "path", attributes: { d: "M15 3h6v6" } },
    { tag: "path", attributes: { d: "m21 3-7 7" } },
    { tag: "path", attributes: { d: "M9 21H3v-6" } },
    { tag: "path", attributes: { d: "m3 21 7-7" } },
  ],
  "exit-fullscreen": [
    { tag: "path", attributes: { d: "M8 3v3a2 2 0 0 1-2 2H3" } },
    { tag: "path", attributes: { d: "M21 8h-3a2 2 0 0 1-2-2V3" } },
    { tag: "path", attributes: { d: "M3 16h3a2 2 0 0 1 2 2v3" } },
    { tag: "path", attributes: { d: "M16 21v-3a2 2 0 0 1 2-2h3" } },
  ],
  fullscreen: [
    { tag: "path", attributes: { d: "M8 3H5a2 2 0 0 0-2 2v3" } },
    { tag: "path", attributes: { d: "M21 8V5a2 2 0 0 0-2-2h-3" } },
    { tag: "path", attributes: { d: "M3 16v3a2 2 0 0 0 2 2h3" } },
    { tag: "path", attributes: { d: "M16 21h3a2 2 0 0 0 2-2v-3" } },
  ],
  reset: [
    { tag: "path", attributes: { d: "M3 12a9 9 0 1 0 3-6.7" } },
    { tag: "path", attributes: { d: "M3 3v6h6" } },
  ],
  "zoom-in": [
    { tag: "path", attributes: { d: "M12 5v14" } },
    { tag: "path", attributes: { d: "M5 12h14" } },
  ],
  "zoom-out": [
    { tag: "path", attributes: { d: "M5 12h14" } },
  ],
} as const satisfies Readonly<Record<MediaViewerIconName, readonly MediaViewerIconChild[]>>;

export interface MediaViewerLabels {
  readonly close: string;
  readonly dialog: string;
  readonly enterFullscreen: string;
  readonly exitFullscreen: string;
  readonly reset: string;
  readonly viewport: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
}

export interface MediaViewerHandle {
  close(options?: { restoreFocus?: boolean }): unknown;
}

interface OpenMediaViewerOptions {
  readonly labels: MediaViewerLabels;
  readonly media: Element;
  readonly mount: Element;
  readonly restoreFocus?: HTMLElement | null;
}

const activeMediaViewers = new WeakMap<Document, MediaViewerHandle>();

function createMediaViewerIcon(
  document: Document,
  className: string,
  name: MediaViewerIconName,
) {
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.classList.add(className);
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("fill", "none");
  icon.setAttribute("height", "15");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "15");
  for (const childDefinition of mediaViewerIconChildren[name]) {
    const child = document.createElementNS(svgNamespace, childDefinition.tag);
    for (const [attribute, value] of Object.entries(childDefinition.attributes)) {
      child.setAttribute(attribute, value);
    }
    icon.append(child);
  }
  return icon;
}

export function createMediaViewerEnlargeIcon(
  document: Document,
  className: string,
) {
  return createMediaViewerIcon(document, className, "enlarge");
}

export function openMediaViewer({
  labels,
  media,
  mount,
  restoreFocus,
}: OpenMediaViewerOptions): MediaViewerHandle {
  const document = media.ownerDocument;
  activeMediaViewers.get(document)?.close({ restoreFocus: false });

  const dialog = document.createElement("div");
  const panel = document.createElement("div");
  const toolbar = document.createElement("div");
  const zoomValue = document.createElement("span");
  const content = document.createElement("div");
  const canvas = document.createElement("div");
  const clonedMedia = media.cloneNode(true) as Element;
  const makeButton = (
    className: string,
    label: string,
    iconClassName: string,
    iconName: MediaViewerIconName,
  ) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.ariaLabel = label;
    button.title = label;
    button.append(createMediaViewerIcon(document, iconClassName, iconName));
    return button;
  };
  const zoomOut = makeButton(
    "markra-media-viewer-control-button markra-media-viewer-zoom-out-button",
    labels.zoomOut,
    "markra-media-viewer-zoom-out-icon",
    "zoom-out",
  );
  const zoomIn = makeButton(
    "markra-media-viewer-control-button markra-media-viewer-zoom-in-button",
    labels.zoomIn,
    "markra-media-viewer-zoom-in-icon",
    "zoom-in",
  );
  const reset = makeButton(
    "markra-media-viewer-control-button markra-media-viewer-reset-button",
    labels.reset,
    "markra-media-viewer-reset-icon",
    "reset",
  );
  const fullscreen = makeButton(
    "markra-media-viewer-control-button markra-media-viewer-fullscreen-button",
    labels.enterFullscreen,
    "markra-media-viewer-fullscreen-icon",
    "fullscreen",
  );
  const closeButton = makeButton(
    "markra-media-viewer-close-button",
    labels.close,
    "markra-media-viewer-close-icon",
    "close",
  );

  dialog.className = "markra-media-viewer-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.ariaLabel = labels.dialog;
  panel.className = "markra-media-viewer-panel";
  toolbar.className = "markra-media-viewer-toolbar";
  zoomValue.className = "markra-media-viewer-zoom-value";
  zoomValue.setAttribute("aria-live", "polite");
  content.className = "markra-media-viewer-content";
  content.tabIndex = 0;
  content.ariaLabel = labels.viewport;
  canvas.className = "markra-media-viewer-canvas";
  clonedMedia.classList.add("markra-media-viewer-media");
  if (clonedMedia.tagName.toLowerCase() === "img") {
    clonedMedia.classList.add("markra-media-viewer-image");
  }
  canvas.append(clonedMedia);

  let closed = false;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let drag: {
    originX: number;
    originY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null = null;
  const syncZoom = () => {
    const scaleValue = String(scale);
    canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleValue})`;
    content.dataset.zoom = scaleValue;
    zoomValue.textContent = `${Math.round(scale * 100)}%`;
  };
  const setZoom = (nextScale: number) => {
    scale = Math.max(0.25, Math.min(6, nextScale));
    syncZoom();
  };
  const setFullscreen = (isFullscreen: boolean) => {
    if (isFullscreen) dialog.dataset.fullscreen = "true";
    else delete dialog.dataset.fullscreen;
    const label = isFullscreen
      ? labels.exitFullscreen
      : labels.enterFullscreen;
    fullscreen.ariaLabel = label;
    fullscreen.title = label;
    fullscreen.ariaPressed = String(isFullscreen);
    fullscreen.replaceChildren(
      createMediaViewerIcon(
        document,
        "markra-media-viewer-fullscreen-icon",
        isFullscreen ? "exit-fullscreen" : "fullscreen",
      ),
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (dialog.dataset.fullscreen === "true") {
      setFullscreen(false);
      return;
    }
    handle.close();
  };
  const handle: MediaViewerHandle = {
    close(options = {}) {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeyDown, true);
      dialog.remove();
      if (activeMediaViewers.get(document) === handle) {
        activeMediaViewers.delete(document);
      }
      if (options.restoreFocus !== false) restoreFocus?.focus();
    },
  };

  fullscreen.ariaPressed = "false";
  zoomOut.addEventListener("click", () => setZoom(scale - 0.25));
  zoomIn.addEventListener("click", () => setZoom(scale + 0.25));
  reset.addEventListener("click", () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    syncZoom();
  });
  fullscreen.addEventListener("click", () => {
    setFullscreen(dialog.dataset.fullscreen !== "true");
  });
  closeButton.addEventListener("click", () => handle.close());
  content.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });
  content.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // Pointer capture keeps Windows WebView drag updates flowing after the
    // cursor leaves the viewport while a large diagram or image is panned.
    content.setPointerCapture?.(event.pointerId);
    content.dataset.dragging = "true";
    drag = {
      originX: translateX,
      originY: translateY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  });
  content.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    translateX = drag.originX + event.clientX - drag.startX;
    translateY = drag.originY + event.clientY - drag.startY;
    syncZoom();
  });
  const stopDragging = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (content.hasPointerCapture?.(event.pointerId)) {
      content.releasePointerCapture(event.pointerId);
    }
    delete content.dataset.dragging;
    drag = null;
  };
  content.addEventListener("pointerup", stopDragging);
  content.addEventListener("pointercancel", stopDragging);
  dialog.addEventListener("mousedown", (event) => {
    if (event.target === dialog) handle.close();
  });
  document.addEventListener("keydown", onKeyDown, true);

  toolbar.append(zoomOut, zoomValue, zoomIn, reset, fullscreen, closeButton);
  content.append(canvas);
  panel.append(toolbar, content);
  dialog.append(panel);
  mount.append(dialog);
  activeMediaViewers.set(document, handle);
  syncZoom();
  closeButton.focus();
  return handle;
}
