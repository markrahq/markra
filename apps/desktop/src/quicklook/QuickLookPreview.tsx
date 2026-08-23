import { MarkdownPreviewDocument } from "@markra/app/markdown-preview";
import { resolveQuickLookImageSrc, type QuickLookPreviewPayload } from "./payload";

type QuickLookPreviewProps = {
  payload: QuickLookPreviewPayload | null;
};

export function QuickLookPreview({ payload }: QuickLookPreviewProps) {
  if (!payload) {
    return (
      <main className="markra-quicklook-state" role="status">
        <span className="markra-quicklook-spinner" aria-hidden="true" />
        <span>Preparing preview…</span>
      </main>
    );
  }

  return (
    <main className="markra-quicklook-document">
      <header className="markra-quicklook-header">
        <span>Markra Quick Look</span>
        <h1>{payload.fileName}</h1>
      </header>
      <MarkdownPreviewDocument
        markdown={payload.markdown}
        resolveImageSrc={resolveQuickLookImageSrc}
      />
    </main>
  );
}
