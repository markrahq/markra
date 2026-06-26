import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  createMarkdownVisualEditorCore,
  type MarkdownVisualEditorCore
} from "@markra/editor-core";
import { t, type AppLanguage } from "@markra/shared";

export type MarkdownCodeMirrorPaperSurfaceProps = {
  autoFocus?: boolean;
  initialContent: string;
  language?: AppLanguage;
  onEditorReady?: (editor: EditorView | null, options?: { autoFocus?: boolean }) => unknown;
  onMarkdownChange: (content: string) => unknown;
  readOnly?: boolean;
};

export function MarkdownCodeMirrorPaperSurface({
  autoFocus = false,
  initialContent,
  language = "en",
  onEditorReady,
  onMarkdownChange,
  readOnly = false
}: MarkdownCodeMirrorPaperSurfaceProps) {
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const initialContentRef = useRef(initialContent);
  const onEditorReadyRef = useRef(onEditorReady);
  const onMarkdownChangeRef = useRef(onMarkdownChange);
  const viewRef = useRef<EditorView | null>(null);
  const editorCoreRef = useRef<MarkdownVisualEditorCore | null>(null);
  const editorLabel = t(language, "app.markdownEditor");

  if (!editorCoreRef.current) {
    editorCoreRef.current = createMarkdownVisualEditorCore({
      label: editorLabel,
      onMarkdownChange: (content) => onMarkdownChangeRef.current(content),
      readOnly
    });
  }

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    onMarkdownChangeRef.current = onMarkdownChange;
  }, [onMarkdownChange]);

  useEffect(() => {
    const container = editorContainerRef.current;
    const editorCore = editorCoreRef.current;
    if (!container || !editorCore || viewRef.current) return;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialContentRef.current,
        extensions: editorCore.extensions
      })
    });

    viewRef.current = view;
    onEditorReadyRef.current?.(view, { autoFocus });
    if (autoFocus) view.focus();

    return () => {
      onEditorReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [autoFocus]);

  useEffect(() => {
    const view = viewRef.current;
    const editorCore = editorCoreRef.current;
    if (!view || !editorCore) return;

    view.dispatch({
      effects: editorCore.reconfigure({
        label: editorLabel,
        readOnly
      })
    });
  }, [editorLabel, readOnly]);

  useEffect(() => {
    if (!autoFocus) return;

    viewRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className="markdown-codemirror-editor min-h-[calc(100vh-176px)]"
      data-testid="markdown-codemirror-editor"
      ref={editorContainerRef}
    />
  );
}
