import { useEffect, useId, useMemo, useRef } from "react";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { jsonSyntaxHighlighting } from "@markra/editor/codemirror";

export function JsonCodeEditor({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => unknown;
  value: string;
}) {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(
    () => [
      basicSetup,
      lintGutter(),
      json(),
      jsonSyntaxHighlighting,
      linter(jsonParseLinter()),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        "data-language": "json",
        role: "textbox",
        spellcheck: "false"
      }),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        onChangeRef.current(update.state.doc.toString());
      }),
      EditorView.theme({
        "&": {
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-heading)",
          fontSize: "12px",
          height: "17.5rem",
          minHeight: "17.5rem"
        },
        "&.cm-editor": {
          borderRadius: "0.375rem"
        },
        "&.cm-focused": {
          outline: "none"
        },
        ".cm-activeLine, .cm-activeLineGutter": {
          backgroundColor: "color-mix(in oklab, var(--accent) 8%, transparent)"
        },
        ".cm-content": {
          minHeight: "17.5rem",
          padding: "0.5rem 0.75rem"
        },
        ".cm-diagnostic": {
          padding: "0.125rem 0.25rem"
        },
        ".cm-gutters": {
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-default)",
          color: "var(--text-secondary)"
        },
        ".cm-line": {
          padding: "0"
        },
        ".cm-markra-json-literal": {
          color: "color-mix(in srgb, var(--link-color) 55%, var(--text-heading)) !important"
        },
        ".cm-markra-json-property": {
          color: "var(--text-heading) !important"
        },
        ".cm-markra-json-string": {
          color: "var(--text-primary) !important"
        },
        ".cm-scroller": {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          lineHeight: "1.25rem"
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          // CodeMirror's focused light fallback is more specific than the
          // app theme and otherwise obscures JSON tokens in dark mode.
          backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent) !important"
        },
        ".cm-tooltip": {
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)"
        }
      })
    ],
    [labelId]
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container || viewRef.current) return;

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions
      })
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [extensions]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) return;

    const currentValue = view.state.doc.toString();

    if (currentValue === value) return;

    view.dispatch({
      changes: {
        from: 0,
        insert: value,
        to: view.state.doc.length
      }
    });
  }, [value]);

  return (
    <div className="grid min-h-0 gap-1.5">
      <span className="text-[12px] leading-5 font-[650] text-(--text-secondary)" id={labelId}>
        {label}
      </span>
      <div
        className="min-h-70 overflow-hidden rounded-md border border-(--border-default) bg-(--bg-primary) text-[12px] leading-5 font-[520] text-(--text-heading) transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-(--accent) focus-within:ring-2 focus-within:ring-(--accent)/20"
        data-language="json"
        data-testid="json-code-editor"
        ref={containerRef}
      />
    </div>
  );
}
