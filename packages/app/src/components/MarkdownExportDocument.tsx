import { useCallback } from "react";
import type { ExportDocumentFormat } from "../lib/document-export";
import type { ExtendedSyntaxPreferences } from "../lib/settings/app-settings";
import { MarkdownPreviewDocument } from "./MarkdownPreviewDocument";

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

export function MarkdownExportDocument({
  extendedSyntax,
  onRendered,
  resolveImageSrc,
  snapshot
}: MarkdownExportDocumentProps) {
  const handleRendered = useCallback((article: HTMLElement) => {
    if (!snapshot) return;

    onRendered({
      bodyHtml: article.innerHTML,
      id: snapshot.id,
      kind: snapshot.kind,
      title: snapshot.title
    });
  }, [onRendered, snapshot]);

  if (!snapshot) return null;

  return (
    <section
      aria-hidden="true"
      className="markdown-export-document"
      data-markra-export-document={snapshot.kind}
    >
      <MarkdownPreviewDocument
        className="markdown-export-paper"
        extendedSyntax={extendedSyntax}
        markdown={snapshot.markdown}
        onRendered={handleRendered}
        resolveImageSrc={resolveImageSrc}
      />
    </section>
  );
}
