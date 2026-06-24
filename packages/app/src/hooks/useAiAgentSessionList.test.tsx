import { renderHook, waitFor } from "@testing-library/react";
import { listStoredAiAgentSessions, type StoredAiAgentSessionSummary } from "../lib/settings/app-settings";
import { useAiAgentSessionList } from "./useAiAgentSessionList";

vi.mock("../lib/settings/app-settings", () => ({
  listStoredAiAgentSessions: vi.fn()
}));

const mockedListStoredAiAgentSessions = vi.mocked(listStoredAiAgentSessions);

const sessions: StoredAiAgentSessionSummary[] = [
  {
    archivedAt: null,
    createdAt: 1,
    id: "session-1",
    messageCount: 2,
    title: "Draft",
    titleSource: "manual",
    updatedAt: 2,
    workspaceKey: "/mock-vault"
  }
];

describe("useAiAgentSessionList", () => {
  beforeEach(() => {
    mockedListStoredAiAgentSessions.mockReset();
    mockedListStoredAiAgentSessions.mockResolvedValue(sessions);
  });

  it("does not read stored sessions while disabled", () => {
    const { result } = renderHook(() => useAiAgentSessionList("/mock-vault", "refresh-1", false));

    expect(result.current.ready).toBe(false);
    expect(result.current.sessions).toEqual([]);
    expect(mockedListStoredAiAgentSessions).not.toHaveBeenCalled();
  });

  it("loads stored sessions when enabled after being disabled", async () => {
    const { rerender, result } = renderHook(
      ({ enabled }) => useAiAgentSessionList("/mock-vault", "refresh-1", enabled),
      { initialProps: { enabled: false } }
    );

    expect(mockedListStoredAiAgentSessions).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.sessions).toEqual(sessions);
    expect(mockedListStoredAiAgentSessions).toHaveBeenCalledWith("/mock-vault", { includeArchived: true });
  });
});
