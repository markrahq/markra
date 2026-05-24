import { Children, cloneElement, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  createMarkraMathMacros,
  isMarkraMathMacroDefinitionSource,
  isMermaidLanguage,
  mermaidThemeFromElement,
  remarkHugoMath,
  renderMarkraMathToString,
  renderMermaidToSvg,
  type MarkraMathMacros
} from "@markra/editor";
import { parseMarkdownCalloutMarker, type ParsedMarkdownCalloutMarker } from "@markra/shared";
import type { ExportDocumentFormat } from "../lib/document-export";
import type { ExtendedSyntaxPreferences } from "../lib/settings/app-settings";

export type MarkdownExportSnapshot = {
  id: number;
  kind: ExportDocumentFormat;
  markdown: string;
  title: string;
};

export type RenderedMarkdownExport = {
  bodyHtml: string;
  id: number;
  kind: ExportDocumentFormat;
  title: string;
};

type MarkdownExportDocumentProps = {
  extendedSyntax?: ExtendedSyntaxPreferences;
  onRendered: (exported: RenderedMarkdownExport) => unknown;
  resolveImageSrc?: (src: string) => string;
  snapshot: MarkdownExportSnapshot | null;
};

function childrenToText(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => typeof child === "string" || typeof child === "number" ? String(child) : "")
    .join("");
}

function hasMathClass(className: unknown, kind: "display" | "inline") {
  return typeof className === "string" && className.split(/\s+/u).includes(`math-${kind}`);
}

function isMathMacroDefinitionMarker(child: ReactNode) {
  return isValidElement<Record<string, unknown>>(child) && child.props["data-markra-math-macro-definition"] === "";
}

function renderMathSource(source: string, kind: "display" | "inline", macros: MarkraMathMacros) {
  const html = renderMarkraMathToString(source, kind, macros);
  if (isMarkraMathMacroDefinitionSource(source)) {
    return <span data-markra-math-macro-definition="" hidden />;
  }

  return (
    <span
      aria-label={kind === "display" ? "Math formula" : "Inline math formula"}
      className={`markra-math-render markra-math-render-${kind}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function mermaidSourceFromPre(pre: HTMLPreElement) {
  const code = pre.querySelector("code");
  if (!code) return null;

  const language = Array.from(code.classList)
    .find((className) => className.startsWith("language-"))
    ?.replace(/^language-/u, "");
  if (!language || !isMermaidLanguage(language)) return null;

  return code.textContent ?? "";
}

async function renderMermaidExportBlocks(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll<HTMLPreElement>("pre"))
    .map((pre) => ({
      pre,
      source: mermaidSourceFromPre(pre)
    }))
    .filter((block): block is { pre: HTMLPreElement; source: string } => block.source !== null);

  await Promise.all(blocks.map(async ({ pre, source }, index) => {
    const render = root.ownerDocument.createElement("div");
    render.className = "markra-mermaid-render";
    render.setAttribute("aria-label", "Mermaid diagram");

    try {
      render.innerHTML = await renderMermaidToSvg(source, {
        idPrefix: `markra-export-mermaid-${index}`,
        theme: mermaidThemeFromElement(root)
      });
    } catch (error) {
      render.className = "markra-mermaid-render markra-mermaid-render-invalid";
      render.dataset.error = error instanceof Error ? error.message : "Unknown Mermaid render error";
      render.textContent = "Unable to render Mermaid diagram";
    }

    pre.replaceWith(render);
  }));
}

function removeCalloutMarkerFromChildren(children: ReactNode, marker: string) {
  let remainingMarkerLength = marker.length;
  let trimLeadingBreak = false;

  return Children.toArray(children)
    .map((child) => {
      if (remainingMarkerLength <= 0 && !trimLeadingBreak) return child;

      if (typeof child === "string" || typeof child === "number") {
        let text = String(child);

        if (remainingMarkerLength > 0) {
          const removeLength = Math.min(remainingMarkerLength, text.length);
          text = text.slice(removeLength);
          remainingMarkerLength -= removeLength;
          if (remainingMarkerLength === 0) trimLeadingBreak = true;
        }

        if (trimLeadingBreak) {
          text = text.replace(/^[\s\r\n]+/u, "");
          if (text.length > 0) trimLeadingBreak = false;
        }

        return text || null;
      }

      if (trimLeadingBreak && isValidElement(child) && child.type === "br") {
        return null;
      }

      return child;
    })
    .filter((child) => child !== null);
}

function renderCalloutHeader(marker: ParsedMarkdownCalloutMarker) {
  return (
    <div className="markra-callout-header">
      <span aria-hidden="true" className="markra-callout-icon" />
      <span className="markra-callout-title">{marker.label}</span>
    </div>
  );
}

function renderCalloutBlockquote(props: {
  children?: ReactNode;
}) {
  const children = Children.toArray(props.children);
  const firstParagraphIndex = children.findIndex((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === "p"
  );
  const firstChild = children[firstParagraphIndex];
  if (!isValidElement<{ children?: ReactNode }>(firstChild) || firstChild.type !== "p") {
    return <blockquote>{props.children}</blockquote>;
  }

  const marker = parseMarkdownCalloutMarker(childrenToText(firstChild.props.children));
  if (!marker) return <blockquote>{props.children}</blockquote>;

  const nextFirstChildContent = removeCalloutMarkerFromChildren(firstChild.props.children, marker.source);
  const nextFirstChild = nextFirstChildContent.length > 0
    ? cloneElement(firstChild as ReactElement<{ children?: ReactNode }>, undefined, nextFirstChildContent)
    : null;
  const nextChildren = [
    ...children.slice(0, firstParagraphIndex),
    ...(nextFirstChild ? [nextFirstChild] : []),
    ...children.slice(firstParagraphIndex + 1)
  ];

  return (
    <blockquote
      className={`markra-callout markra-callout-${marker.type}`}
      data-callout-label={marker.label}
      data-callout-type={marker.type}
    >
      {renderCalloutHeader(marker)}
      {nextChildren}
    </blockquote>
  );
}

export function MarkdownExportDocument({
  extendedSyntax,
  onRendered,
  resolveImageSrc,
  snapshot
}: MarkdownExportDocumentProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const githubAlertsEnabled = extendedSyntax?.githubAlerts ?? true;

  useEffect(() => {
    if (!snapshot || !articleRef.current) return;

    let cancelled = false;
    const article = articleRef.current;
    const renderExport = async () => {
      await renderMermaidExportBlocks(article);
      if (cancelled) return;

      onRendered({
        bodyHtml: article.innerHTML,
        id: snapshot.id,
        kind: snapshot.kind,
        title: snapshot.title
      });
    };

    renderExport().catch(() => {
      if (cancelled) return;

      onRendered({
        bodyHtml: article.innerHTML,
        id: snapshot.id,
        kind: snapshot.kind,
        title: snapshot.title
      });
    });

    return () => {
      cancelled = true;
    };
  }, [githubAlertsEnabled, onRendered, snapshot]);

  if (!snapshot) return null;

  const mathMacros = createMarkraMathMacros();

  return (
    <section
      aria-hidden="true"
      className="markdown-export-document"
      data-markra-export-document={snapshot.kind}
    >
      <article className="markdown-paper markdown-export-paper" ref={articleRef}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks, remarkMath, remarkHugoMath]}
          components={{
            a: ({ node: _node, ...props }) => <a {...props} rel="noreferrer" target="_blank" />,
            blockquote: ({ node: _node, ...props }) =>
              githubAlertsEnabled ? renderCalloutBlockquote(props) : <blockquote {...props} />,
            code: ({ node: _node, className, children, ...props }) => {
              if (hasMathClass(className, "inline")) {
                return renderMathSource(childrenToText(children), "inline", mathMacros);
              }

              if (hasMathClass(className, "display")) {
                return renderMathSource(childrenToText(children), "display", mathMacros);
              }

              return <code {...props} className={className}>{children}</code>;
            },
            img: ({ node: _node, src, alt, ...props }) => (
              <img
                {...props}
                alt={alt ?? ""}
                src={resolveImageSrc && typeof src === "string" ? resolveImageSrc(src) : src}
              />
            ),
            pre: ({ node: _node, children, ...props }) => {
              const onlyChild = Children.toArray(children)[0];
              if (isMathMacroDefinitionMarker(onlyChild)) return null;
              if (
                isValidElement<{ className?: string }>(onlyChild) &&
                hasMathClass(onlyChild.props.className, "display")
              ) {
                return onlyChild;
              }

              return <pre {...props}>{children}</pre>;
            }
          }}
        >
          {snapshot.markdown}
        </ReactMarkdown>
      </article>
    </section>
  );
}
