import { X } from "lucide-react";
import type { PluginSidePanel } from "../lib/plugins/side-panels";

type PluginSidePanelHostProps = {
  activePanelId: string | null;
  closeLabel: string;
  panels: readonly PluginSidePanel[];
  panelListLabel: string;
  onClose: () => unknown;
  onSelectPanel: (id: string) => unknown;
};

export function PluginSidePanelHost({
  activePanelId,
  closeLabel,
  panels,
  panelListLabel,
  onClose,
  onSelectPanel
}: PluginSidePanelHostProps) {
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];
  if (!activePanel) return null;

  const multiPanel = panels.length > 1;

  return (
    <aside
      className="plugin-side-panel-host flex h-full min-h-0 w-full flex-col border-l border-(--border-default) bg-(--bg-primary)"
      role="complementary"
      aria-label={activePanel.title}
    >
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-(--border-default) px-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[13px] leading-5 font-[650] tracking-normal text-(--text-heading)">
            {activePanel.title}
          </h2>
          <p className="m-0 truncate text-[11px] leading-4 font-[520] text-(--text-secondary)">
            {activePanel.pluginName}
          </p>
        </div>
        <button
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent text-(--text-secondary) transition-colors duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </header>

      {multiPanel ? (
        <div
          className="flex h-10 shrink-0 items-center gap-1 border-b border-(--border-default) px-2"
          role="tablist"
          aria-label={panelListLabel}
        >
          {panels.map((panel) => (
            <button
              key={panel.id}
              className={`h-7 min-w-0 flex-1 truncate rounded-md border-0 px-2 text-[12px] leading-none font-[560] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) ${
                panel.id === activePanel.id
                  ? "bg-(--bg-active) text-(--text-heading)"
                  : "bg-transparent text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading)"
              }`}
              type="button"
              role="tab"
              aria-selected={panel.id === activePanel.id}
              onClick={() => onSelectPanel(panel.id)}
            >
              {panel.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-3">
        {activePanel.content}
      </div>
    </aside>
  );
}
