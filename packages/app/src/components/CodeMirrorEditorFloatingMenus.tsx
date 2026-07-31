import {
  closeMarkraDocumentLinks,
  closeMarkraSlashMenu,
} from "@markra/editor/codemirror";
import {
  useMarkraEditorCaretAnchor,
  useMarkraEditorDocumentLinks,
  useMarkraEditorSlashMenu,
  useMarkraEditorView,
} from "@markra/editor-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

export interface CodeMirrorEditorFloatingMenusProps {
  documentLinksLabel?: string;
  slashMenuEmptyLabel?: string;
  slashMenuLabel?: string;
}

function keepEditorSelection(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}

interface FloatingMenuPoint {
  left: number;
  top: number;
}

interface FloatingMenuSize {
  height: number;
  width: number;
}

const floatingMenuMargin = 12;
const slashMenuMaximumHeight = 320;

export function fitCodeMirrorFloatingMenu(
  anchor: FloatingMenuPoint,
  menu: FloatingMenuSize,
  viewport: FloatingMenuSize,
) {
  return {
    left: Math.max(
      floatingMenuMargin,
      Math.min(anchor.left, viewport.width - menu.width - floatingMenuMargin),
    ),
    top: Math.max(
      floatingMenuMargin,
      Math.min(anchor.top, viewport.height - menu.height - floatingMenuMargin),
    ),
  };
}

function useFloatingMenuStyle(
  anchor: FloatingMenuPoint | null,
  open: boolean,
  fallback: FloatingMenuSize,
  revision: string,
  maximumHeight?: number,
) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const rect = element.getBoundingClientRect();
    const next = {
      height: Math.max(rect.height, element.scrollHeight, fallback.height),
      width: Math.max(rect.width, element.scrollWidth, fallback.width),
    };
    setSize((current) =>
      current.height === next.height && current.width === next.width
        ? current
        : next,
    );
  }, [fallback.height, fallback.width, open, revision]);

  if (!anchor) return { ref, style: undefined };
  const viewport = {
    height: window.innerHeight,
    width: window.innerWidth,
  };
  const availableHeight = viewport.height - floatingMenuMargin * 2;
  const maxHeight = Math.min(maximumHeight ?? availableHeight, availableHeight);
  const fitted = fitCodeMirrorFloatingMenu(
    anchor,
    {
      height: Math.min(size.height, maxHeight),
      width: Math.min(size.width, viewport.width - floatingMenuMargin * 2),
    },
    viewport,
  );
  return {
    ref,
    style: {
      left: fitted.left,
      maxHeight,
      overflowY: "auto",
      top: fitted.top,
    } satisfies CSSProperties,
  };
}

export function CodeMirrorEditorFloatingMenus({
  documentLinksLabel = "Document links",
  slashMenuEmptyLabel = "No matching commands",
  slashMenuLabel = "Insert block",
}: CodeMirrorEditorFloatingMenusProps) {
  const slashMenu = useMarkraEditorSlashMenu();
  const documentLinks = useMarkraEditorDocumentLinks();
  const view = useMarkraEditorView();
  const selectedSlashOptionRef = useRef<HTMLButtonElement | null>(null);
  const slashAnchor = useMarkraEditorCaretAnchor(slashMenu.to);
  const documentLinkAnchor = useMarkraEditorCaretAnchor(documentLinks.to);
  const slashPlacement = useFloatingMenuStyle(
    slashAnchor,
    slashMenu.open,
    { height: 320, width: 240 },
    `${slashMenu.query}:${slashMenu.actions.length}`,
    slashMenuMaximumHeight,
  );
  const documentLinkPlacement = useFloatingMenuStyle(
    documentLinkAnchor,
    documentLinks.open,
    { height: 280, width: 352 },
    `${documentLinks.query}:${documentLinks.items.length}`,
  );

  useEffect(() => {
    selectedSlashOptionRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [slashMenu.open, slashMenu.query, slashMenu.selectedIndex]);

  useEffect(() => {
    if (!view || (!slashMenu.open && !documentLinks.open)) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Element
        ? event.target
        : event.target instanceof Node
          ? event.target.parentElement
          : null;
      if (target?.closest(".markra-slash-menu, .markra-document-link-menu")) {
        return;
      }
      if (slashMenu.open) closeMarkraSlashMenu(view);
      if (documentLinks.open) closeMarkraDocumentLinks(view);
    };
    const document = view.dom.ownerDocument;
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [documentLinks.open, slashMenu.open, view]);

  return (
    <>
      {slashMenu.open && slashPlacement.style ? (
        <div
          aria-label={slashMenuLabel}
          className="markra-slash-menu"
          role="menu"
          ref={slashPlacement.ref}
          style={slashPlacement.style}
        >
          {slashMenu.actions.length > 0 ? (
            slashMenu.actions.map((action, index) => (
              <button
                aria-selected={index === slashMenu.selectedIndex}
                className="markra-slash-menu-option"
                key={action.command}
                onClick={() => {
                  action.run();
                }}
                onMouseDown={keepEditorSelection}
                ref={
                  index === slashMenu.selectedIndex
                    ? selectedSlashOptionRef
                    : undefined
                }
                role="menuitem"
                type="button"
              >
                {action.label}
              </button>
            ))
          ) : (
            <div className="markra-slash-menu-empty">{slashMenuEmptyLabel}</div>
          )}
        </div>
      ) : null}

      {documentLinks.open && documentLinkPlacement.style ? (
        <div
          aria-label={documentLinksLabel}
          className="markra-document-link-menu"
          role="listbox"
          ref={documentLinkPlacement.ref}
          style={documentLinkPlacement.style}
        >
          {documentLinks.items.map((item, index) => (
            <button
              aria-selected={index === documentLinks.selectedIndex}
              className="markra-document-link-option w-full border-0 bg-transparent"
              key={item.id}
              onClick={() => {
                item.run();
              }}
              onMouseDown={keepEditorSelection}
              role="option"
              type="button"
            >
              <span className="markra-document-link-title">{item.label}</span>
              {item.detail ? (
                <span className="markra-document-link-path">{item.detail}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
