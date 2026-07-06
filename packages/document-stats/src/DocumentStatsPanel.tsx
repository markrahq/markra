import { useEffect, useMemo, useState } from "react";
import type { PluginDocument, PluginStorage } from "@markra/plugin-api";
import { SettingsButton } from "@markra/plugin-api/react";
import { analyzeMarkdown, type DocumentStats } from "./stats";
import { loadDocumentStatsOptions } from "./storage";

type DocumentStatsPanelProps = {
  document?: PluginDocument;
  storage?: PluginStorage;
};

type PanelState = {
  documentName: string | null;
  error: string | null;
  loading: boolean;
  stats: DocumentStats | null;
};

const emptyState: PanelState = {
  documentName: null,
  error: null,
  loading: true,
  stats: null
};

export function DocumentStatsPanel({ document, storage }: DocumentStatsPanelProps) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<PanelState>(emptyState);
  const statItems = useMemo(() => statsToItems(state.stats), [state.stats]);

  useEffect(() => {
    let cancelled = false;

    setState((currentState) => ({ ...currentState, error: null, loading: true }));
    readStats(document, storage)
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            documentName: null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            stats: null
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [document, refreshToken, storage]);

  return (
    <section className="document-stats-panel flex min-h-0 flex-col gap-4">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] leading-5 font-bold tracking-normal text-(--text-heading)">
            Current document
          </h3>
          <p className="m-0 mt-0.5 truncate text-[12px] leading-4.5 font-[450] text-(--text-secondary)">
            {state.documentName ?? "No active Markdown document"}
          </p>
        </div>
        <SettingsButton
          label="Refresh document stats"
          onClick={() => setRefreshToken((currentToken) => currentToken + 1)}
        >
          Refresh
        </SettingsButton>
      </header>

      {state.error ? (
        <div className="rounded-md bg-(--bg-secondary) px-3 py-2 text-[12px] leading-5 font-[520] text-(--text-heading)">
          {state.error}
        </div>
      ) : null}

      {state.loading ? (
        <div className="text-[12px] leading-5 font-[520] text-(--text-secondary)">Loading...</div>
      ) : null}

      {!state.loading && !state.stats ? (
        <div className="text-[12px] leading-5 font-[520] text-(--text-secondary)">No statistics available.</div>
      ) : null}

      {state.stats ? (
        <div className="grid grid-cols-2 gap-2">
          {statItems.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-md border border-(--border-default) bg-(--bg-secondary) px-3 py-2"
            >
              <div className="truncate text-[11px] leading-4 font-[560] text-(--text-secondary)">
                {item.label}
              </div>
              <div className="mt-0.5 truncate text-[18px] leading-6 font-bold tracking-normal text-(--text-heading)">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

async function readStats(document: PluginDocument | undefined, storage: PluginStorage | undefined): Promise<PanelState> {
  const activeDocument = await document?.getActive();
  if (!activeDocument) {
    return {
      documentName: null,
      error: null,
      loading: false,
      stats: null
    };
  }

  const options = await loadDocumentStatsOptions(storage);

  return {
    documentName: activeDocument.name,
    error: null,
    loading: false,
    stats: analyzeMarkdown(activeDocument.content, options)
  };
}

function statsToItems(stats: DocumentStats | null) {
  if (!stats) return [];

  return [
    { label: "Words", value: formatNumber(stats.words) },
    { label: "Characters", value: formatNumber(stats.characters) },
    { label: "Paragraphs", value: formatNumber(stats.paragraphs) },
    { label: "Headings", value: formatNumber(stats.headings) },
    { label: "Reading time", value: `${formatNumber(stats.readingTimeMinutes)} min` }
  ];
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}
