import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, Check, History, MessageSquarePlus, PencilLine, Search, Trash2 } from "lucide-react";
import { Button, IconButton, PopoverSurface, SearchInput } from "@markra/ui";
import { t, type AppLanguage, type I18nKey } from "@markra/shared";
import type { StoredAiAgentSessionSummary } from "../lib/settings/app-settings";
import { anchoredPopoverStyle } from "../lib/anchored-popover";
import { confirmNativeAiAgentSessionDelete } from "../lib/tauri";

const menuExitDurationMs = 140;

type AiAgentSessionMenuProps = {
  activeSessionId?: string | null;
  language?: AppLanguage;
  sessions?: StoredAiAgentSessionSummary[];
  onArchiveSession?: (sessionId: string, archived: boolean) => unknown;
  onCreateSession?: () => unknown;
  onDeleteSession?: (sessionId: string) => unknown;
  onRenameSession?: (sessionId: string, title: string) => unknown;
  onSelectSession?: (sessionId: string) => unknown;
};

export function AiAgentSessionMenu({
  activeSessionId = null,
  language = "en",
  sessions = [],
  onArchiveSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
  onSelectSession
}: AiAgentSessionMenuProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const label = (key: I18nKey) => t(language, key);
  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return sessions.filter((session) => {
      if (!showArchived && session.archivedAt !== null) return false;
      if (!normalizedQuery) return true;

      const sessionTitle = (session.title ?? label("app.aiAgentSessionUntitled")).toLocaleLowerCase();

      return sessionTitle.includes(normalizedQuery);
    });
  }, [label, query, sessions, showArchived]);
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short"
      }),
    [language]
  );

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      setMenuVisible(true);
      return;
    }

    if (!menuVisible) return;
    setEditingSessionId(null);
    setEditingTitle("");

    closeTimerRef.current = window.setTimeout(() => {
      setMenuVisible(false);
      closeTimerRef.current = null;
    }, menuExitDurationMs);
  }, [menuVisible, open]);

  const positionMenu = (trigger: HTMLButtonElement) => {
    setMenuStyle(
      anchoredPopoverStyle(trigger, menuRef.current, {
        align: "end",
        fallbackSize: {
          height: 400,
          width: 288
        },
        gap: 8
      })
    );
  };

  useLayoutEffect(() => {
    if (!open || !menuVisible) return;

    const trigger = triggerRef.current;
    if (trigger) positionMenu(trigger);
  }, [filteredSessions.length, menuVisible, open, showArchived]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;

      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handleLayoutChange = () => {
      const trigger = triggerRef.current;
      if (trigger) positionMenu(trigger);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current === null) return;

      window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const commitRename = (sessionId: string) => {
    const normalizedTitle = editingTitle.trim();
    if (normalizedTitle) onRenameSession?.(sessionId, normalizedTitle);
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const requestDeleteSession = async (sessionId: string, sessionTitle: string) => {
    setEditingSessionId(null);
    setEditingTitle("");
    setOpen(false);

    const confirmed = await confirmNativeAiAgentSessionDelete(sessionTitle, {
      cancelLabel: label("app.aiAgentCancelDeleteSession"),
      message: label("app.aiAgentConfirmDeleteSession"),
      okLabel: label("app.aiAgentConfirmDeleteSessionAction")
    });

    if (!confirmed) return;

    await onDeleteSession?.(sessionId);
  };

  const menu =
    menuVisible && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <PopoverSurface
            ref={menuRef}
            className="fixed z-40 w-72 overflow-hidden rounded-xl"
            style={menuStyle}
            open={open}
            openClassName="pointer-events-auto translate-y-0 opacity-100"
            closedClassName="pointer-events-none -translate-y-1 opacity-0"
            role="menu"
            aria-label={label("app.aiAgentSessions")}
          >
            <div className="border-b border-(--border-default) p-1.5">
              <Button
                className="w-full justify-start rounded-lg bg-(--bg-secondary) text-left font-semibold text-(--text-primary) hover:border-(--border-strong)"
                size="md"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCreateSession?.();
                }}
              >
                <MessageSquarePlus aria-hidden="true" className="shrink-0 text-(--text-secondary)" size={14} />
                <span className="truncate">{label("app.aiAgentNewSession")}</span>
              </Button>
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                <SearchInput
                  aria-label={label("app.aiAgentSearchSessions")}
                  className="rounded-lg text-(--text-primary) focus:ring-0"
                  icon={<Search size={13} />}
                  size="sm"
                  value={query}
                  placeholder={label("app.aiAgentSearchSessions")}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                />
                <IconButton
                  className={`rounded-lg ${
                    showArchived
                      ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                      : "border-(--border-default) bg-(--bg-primary) text-(--text-secondary) hover:border-(--border-strong) hover:text-(--text-heading)"
                  }`}
                  label={showArchived ? label("app.aiAgentHideArchivedSessions") : label("app.aiAgentShowArchivedSessions")}
                  pressed={showArchived}
                  size="icon-md"
                  variant="secondary"
                  onClick={() => setShowArchived((current) => !current)}
                >
                  <Archive aria-hidden="true" size={13} />
                </IconButton>
              </div>
            </div>
            <div className="max-h-80 overflow-auto p-1.5">
              {filteredSessions.length > 0 ? (
                <div className="grid gap-1">
                  {filteredSessions.map((session) => {
                    const active = session.id === activeSessionId;
                    const sessionTitle = session.title ?? label("app.aiAgentSessionUntitled");
                    const editing = editingSessionId === session.id;
                    const archived = session.archivedAt !== null;

                    return (
                      <div
                        className={`relative rounded-lg border transition-[background-color,border-color,color] duration-150 ease-out ${
                          active
                            ? "border-(--accent) bg-(--accent-soft) text-(--text-heading)"
                            : archived
                              ? "border-transparent bg-transparent text-(--text-secondary) opacity-75 hover:border-(--border-default) hover:bg-(--bg-hover) hover:text-(--text-heading) hover:opacity-100"
                              : "border-transparent bg-transparent text-(--text-primary) hover:border-(--border-default) hover:bg-(--bg-hover) hover:text-(--text-heading)"
                        }`}
                        key={session.id}
                      >
                        {editing ? (
                          <div className="grid gap-1 px-3 py-2">
                            <input
                              aria-label={label("app.aiAgentRenameSessionInput")}
                              autoFocus
                              className="h-8 rounded-md border border-(--accent) bg-(--bg-primary) px-2 text-[12px] leading-5 font-[620] text-(--text-primary) outline-none"
                              type="text"
                              value={editingTitle}
                              onBlur={() => commitRename(session.id)}
                              onChange={(event) => setEditingTitle(event.target.value)}
                              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRename(session.id);
                                  return;
                                }

                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelRename();
                                }
                              }}
                            />
                            <span className="truncate text-[11px] leading-4 text-(--text-secondary)">
                              {formatter.format(session.updatedAt)}
                            </span>
                          </div>
                        ) : (
                          <>
                            <button
                              className="grid w-full cursor-pointer gap-0.5 rounded-lg px-3 py-2 pr-24 text-left"
                              type="button"
                              role="menuitemradio"
                              aria-checked={active}
                              onClick={() => {
                                setOpen(false);
                                onSelectSession?.(session.id);
                              }}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-[12px] leading-5 font-[620]">
                                  {sessionTitle}
                                </span>
                                {active ? <Check aria-hidden="true" className="shrink-0 text-(--accent)" size={14} /> : null}
                              </span>
                              <span className="truncate text-[11px] leading-4 text-(--text-secondary)">
                                {formatter.format(session.updatedAt)}
                              </span>
                            </button>
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                              <IconButton
                                className="hover:bg-(--bg-active) focus-visible:bg-(--bg-active)"
                                label={`${label("app.aiAgentRenameSession")} ${sessionTitle}`}
                                size="icon-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditingSessionId(session.id);
                                  setEditingTitle(sessionTitle);
                                }}
                              >
                                <PencilLine aria-hidden="true" size={12} />
                              </IconButton>
                              <IconButton
                                className="hover:bg-(--bg-active) focus-visible:bg-(--bg-active)"
                                label={`${archived ? label("app.aiAgentRestoreSession") : label("app.aiAgentArchiveSession")} ${sessionTitle}`}
                                size="icon-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onArchiveSession?.(session.id, !archived);
                                }}
                              >
                                {archived ? <ArchiveRestore aria-hidden="true" size={12} /> : <Archive aria-hidden="true" size={12} />}
                              </IconButton>
                              <IconButton
                                className="hover:bg-(--bg-active) focus-visible:bg-(--bg-active)"
                                label={`${label("app.aiAgentDeleteSession")} ${sessionTitle}`}
                                size="icon-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestDeleteSession(session.id, sessionTitle).catch(() => {});
                                }}
                              >
                                <Trash2 aria-hidden="true" size={12} />
                              </IconButton>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="m-0 px-2 py-3 text-[12px] leading-5 text-(--text-secondary)">
                  {sessions.length > 0 ? label("app.aiAgentNoMatchingSessions") : label("app.aiAgentNoSessions")}
                </p>
              )}
            </div>
          </PopoverSurface>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        className={`inline-flex size-8 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent p-0 text-(--text-secondary) transition-[background-color,color] duration-150 ease-out hover:bg-(--bg-hover) hover:text-(--text-heading) focus-visible:bg-(--bg-hover) focus-visible:text-(--text-heading) focus-visible:outline-none ${
          open ? "bg-(--bg-hover) text-(--text-heading)" : ""
        }`}
        type="button"
        aria-label={label("app.aiAgentSessions")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          if (!open) positionMenu(event.currentTarget);
          setOpen(!open);
        }}
      >
        <History aria-hidden="true" size={15} />
      </button>
      {menu}
    </div>
  );
}
