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
  documentSearchAvailable: boolean;
  documentSearchOpen: boolean;
  editorAgentLayoutClassName: string;
  editorAgentLayoutStyle: CSSProperties;
  editorDropTargetActive: boolean;
  fileTree: MarkdownFileTreeDrawerProps;
  windowsSelfDrawnChrome: boolean;
  workspaceLayoutClassName: string;
  workspaceLayoutStyle: CSSProperties;
  onEditorContentDragLeave: () => unknown;
  onEditorContentDragOver: (event: ReactDragEvent<HTMLDivElement>) => unknown;
  onEditorContentDrop: (event: ReactDragEvent<HTMLDivElement>) => unknown;
};

export function WorkspaceLayout({
  aiAgentPanel,
  children,
  documentSearchAvailable,
  documentSearchOpen,
  editorAgentLayoutClassName,
  editorAgentLayoutStyle,
  editorDropTargetActive,
  fileTree,
  windowsSelfDrawnChrome,
  workspaceLayoutClassName,
  workspaceLayoutStyle,
  onEditorContentDragLeave,
  onEditorContentDragOver,
  onEditorContentDrop
}: WorkspaceLayoutProps) {
  return (
    <div
      className={`${workspaceLayoutClassName} ${windowsSelfDrawnChrome ? "pt-10" : ""}`}
      style={workspaceLayoutStyle}
    >
      <div className="markdown-file-tree-slot min-h-0 overflow-hidden">
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
    </div>
  );
}
