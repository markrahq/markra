import type {
  ComponentProps,
  CSSProperties,
  DragEvent as ReactDragEvent,
  ReactNode
} from "react";
import { MarkdownFileTreeDrawer } from "./MarkdownFileTreeDrawer";

type MarkdownFileTreeDrawerProps = ComponentProps<typeof MarkdownFileTreeDrawer>;

type WorkspaceLayoutProps = {
  aiAgentPanel: ReactNode;
  children: ReactNode;
  compactFileTreeOverlay?: boolean;
  documentSearchAvailable: boolean;
  documentSearchOpen: boolean;
  editorAgentLayoutClassName: string;
  editorAgentLayoutStyle: CSSProperties;
  editorDropTargetActive: boolean;
  fileTree: MarkdownFileTreeDrawerProps;
  windowsSelfDrawnChrome: boolean;
  workspaceOperationOverlay?: ReactNode;
  workspaceLayoutClassName: string;
  workspaceLayoutStyle: CSSProperties;
  onEditorContentDragLeave: () => unknown;
  onEditorContentDragOver: (event: ReactDragEvent<HTMLDivElement>) => unknown;
  onEditorContentDrop: (event: ReactDragEvent<HTMLDivElement>) => unknown;
};

export function WorkspaceLayout({
  aiAgentPanel,
  children,
  compactFileTreeOverlay = false,
  documentSearchAvailable,
  documentSearchOpen,
  editorAgentLayoutClassName,
  editorAgentLayoutStyle,
  editorDropTargetActive,
  fileTree,
  windowsSelfDrawnChrome,
  workspaceOperationOverlay = null,
  workspaceLayoutClassName,
  workspaceLayoutStyle,
  onEditorContentDragLeave,
  onEditorContentDragOver,
  onEditorContentDrop
}: WorkspaceLayoutProps) {
  const fileTreeOverlayOpen = compactFileTreeOverlay && fileTree.open;

  return (
    <div
      className={`${workspaceLayoutClassName} ${windowsSelfDrawnChrome ? "pt-10" : ""}`}
      style={workspaceLayoutStyle}
    >
      {fileTreeOverlayOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 top-10 bottom-0 z-20 bg-black/20"
          onPointerDown={() => fileTree.onToggleMarkdownFiles?.()}
        />
      ) : null}
      <div
        className={`markdown-file-tree-slot min-h-0 overflow-hidden ${
          fileTreeOverlayOpen
            ? "fixed top-10 bottom-0 left-0 z-30 shadow-[12px_0_32px_color-mix(in_srgb,var(--text-heading)_16%,transparent)]"
            : ""
        }`}
        data-compact-overlay={fileTreeOverlayOpen ? "true" : undefined}
      >
        <MarkdownFileTreeDrawer {...fileTree} />
      </div>

      <div
        className={editorAgentLayoutClassName}
        style={editorAgentLayoutStyle}
      >
        <div
          className={`editor-content-slot relative h-full min-h-0 overflow-hidden transition-shadow duration-150 ease-out ${
            editorDropTargetActive ? "ring-2 ring-(--accent)/30 ring-inset" : ""
          }`}
          data-document-search-open={documentSearchOpen && documentSearchAvailable ? "true" : undefined}
          data-document-tab-editor-drop-target="true"
          data-document-tab-drop-target={editorDropTargetActive ? "true" : undefined}
          data-ai-workspace-editor="true"
          onDragLeave={onEditorContentDragLeave}
          onDragOver={onEditorContentDragOver}
          onDrop={onEditorContentDrop}
        >
          {children}
        </div>

        <div className="ai-agent-panel-slot relative z-20 min-h-0 overflow-hidden">
          {aiAgentPanel}
        </div>
      </div>

      {workspaceOperationOverlay}
    </div>
  );
}
