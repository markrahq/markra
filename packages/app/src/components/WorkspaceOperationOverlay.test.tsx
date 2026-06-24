import { act, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceOperationAnimationEvent } from "../lib/workspace-operation-animation";
import { WorkspaceOperationOverlay } from "./WorkspaceOperationOverlay";

const appliedEvents: WorkspaceOperationAnimationEvent[] = [
  {
    totalSteps: 2,
    type: "operation_started"
  },
  {
    action: "create_note",
    index: 0,
    label: "Create note: topics/alpha.md",
    path: "topics/alpha.md",
    target: "file_tree",
    type: "step_started"
  },
  {
    action: "create_note",
    afterContent: "# Alpha",
    index: 0,
    label: "Create note: topics/alpha.md",
    path: "topics/alpha.md",
    target: "file_tree",
    type: "step_previewed"
  },
  {
    action: "create_note",
    afterContent: "# Alpha",
    index: 0,
    label: "Create note: topics/alpha.md",
    path: "topics/alpha.md",
    target: "file_tree",
    type: "step_applied"
  },
  {
    action: "add_tags",
    index: 1,
    label: "Add tags: current.md",
    path: "current.md",
    target: "editor",
    type: "step_started"
  },
  {
    action: "add_tags",
    afterContent: "Tags: alpha",
    index: 1,
    label: "Add tags: current.md",
    path: "current.md",
    target: "editor",
    type: "step_previewed"
  },
  {
    action: "add_tags",
    afterContent: "Tags: alpha",
    index: 1,
    label: "Add tags: current.md",
    path: "current.md",
    target: "editor",
    type: "step_applied"
  },
  {
    count: 2,
    type: "operation_completed"
  }
];
const liveFileTreeEvents: WorkspaceOperationAnimationEvent[] = [
  {
    totalSteps: 1,
    type: "operation_started"
  },
  {
    action: "create_note",
    index: 0,
    label: "Create note: topics/beta.md",
    path: "topics/beta.md",
    target: "file_tree",
    type: "step_started"
  }
];
const hiddenFileEvents: WorkspaceOperationAnimationEvent[] = [
  {
    totalSteps: 1,
    type: "operation_started"
  },
  {
    action: "update_note",
    index: 0,
    label: "Update note: docs/hidden.md",
    path: "docs/hidden.md",
    target: "file_tree",
    type: "step_started"
  }
];
const hiddenRootFileEvents: WorkspaceOperationAnimationEvent[] = [
  {
    totalSteps: 1,
    type: "operation_started"
  },
  {
    action: "create_note",
    index: 0,
    label: "Create note: TODO.md",
    path: "TODO.md",
    target: "file_tree",
    type: "step_started"
  }
];

function setRect(element: Element | null, rect: Partial<DOMRect>) {
  if (!element) throw new Error("Missing test element");

  const normalizedRect = {
    bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
    height: rect.height ?? 0,
    left: rect.left ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
    top: rect.top ?? 0,
    width: rect.width ?? 0,
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    toJSON: () => ({})
  } satisfies DOMRect;

  element.getBoundingClientRect = vi.fn(() => normalizedRect);
}

function renderWorkspaceOverlay(events: WorkspaceOperationAnimationEvent[] = appliedEvents) {
  return render(
    <>
      <aside className="markdown-file-tree-slot">
        <button
          data-ai-workspace-file-path="/vault/topics/alpha.md"
          data-ai-workspace-file-relative-path="topics/alpha.md"
          type="button"
        >
          <span
            data-ai-workspace-file-label-path="/vault/topics/alpha.md"
            data-ai-workspace-file-label-relative-path="topics/alpha.md"
          >
            alpha.md
          </span>
        </button>
      </aside>
      <main
        className="editor-content-slot"
        data-ai-workspace-editor="true"
      >
        <div className="markdown-paper">Editor</div>
      </main>
      <WorkspaceOperationOverlay
        events={events}
        playbackDelayMs={100}
        status="applied"
      />
    </>
  );
}

describe("WorkspaceOperationOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("anchors the AI cursor to the real workspace file row during file-tree steps", () => {
    vi.useFakeTimers();
    const { container } = renderWorkspaceOverlay();
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });
    setRect(container.querySelector("[data-ai-workspace-editor='true']"), {
      height: 520,
      left: 320,
      top: 50,
      width: 620
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    const cursor = screen.getByTestId("workspace-operation-cursor");

    expect(cursor).toHaveAttribute("data-ai-workspace-target", "file_tree");
    expect(cursor).toHaveStyle({
      transform: "translate3d(84px, 88px, 0)"
    });
    expect(cursor.style.left).toBe("");
    expect(cursor.style.top).toBe("");
  });

  it("keeps workspace operation details out of the workspace overlay", () => {
    const previewEvents: WorkspaceOperationAnimationEvent[] = [
      {
        totalSteps: 1,
        type: "operation_started"
      },
      {
        action: "create_note",
        afterContent: "# Alpha\n\nSynthetic detail",
        index: 0,
        label: "Create note: topics/alpha.md",
        path: "topics/alpha.md",
        target: "file_tree",
        type: "step_previewed"
      }
    ];
    const { container } = render(
      <>
        <aside className="markdown-file-tree-slot">
          <button
            data-ai-workspace-file-relative-path="topics/alpha.md"
            type="button"
          >
            <span data-ai-workspace-file-label-relative-path="topics/alpha.md">alpha.md</span>
          </button>
        </aside>
        <WorkspaceOperationOverlay
          events={previewEvents}
          status="applying"
        />
      </>
    );
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.queryByTestId("workspace-operation-step-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-operation-step-list")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
      transform: "translate3d(84px, 88px, 0)"
    });
    expect(screen.getByTestId("workspace-operation-target")).toHaveStyle({
      transform: "translate3d(40px, 72px, 0)"
    });
  });

  it("keeps the cursor tip on the target while offsetting its label bubble", () => {
    vi.useFakeTimers();
    const { container } = renderWorkspaceOverlay();
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
      transform: "translate3d(84px, 88px, 0)"
    });
    expect(screen.getByTestId("workspace-operation-cursor-pointer")).toHaveAttribute("data-ai-workspace-cursor-tip", "true");
    expect(screen.getByTestId("workspace-operation-cursor-bubble")).toHaveStyle({
      transform: "translate3d(18px, 9px, 0)"
    });
  });

  it("moves the AI cursor onto the real editor area as playback advances", () => {
    vi.useFakeTimers();
    const { container } = renderWorkspaceOverlay();
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });
    setRect(container.querySelector("[data-ai-workspace-editor='true']"), {
      height: 500,
      left: 300,
      top: 80,
      width: 600
    });
    setRect(container.querySelector(".markdown-paper"), {
      height: 360,
      left: 380,
      top: 118,
      width: 520
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    for (let frame = 0; frame < 6; frame += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    const cursor = screen.getByTestId("workspace-operation-cursor");

    expect(cursor).toHaveAttribute("data-ai-workspace-target", "editor");
    expect(cursor).toHaveStyle({
      transform: "translate3d(442px, 183px, 0)"
    });
  });

  it("dismisses the workspace overlay shortly after completed playback", () => {
    vi.useFakeTimers();
    const { container } = renderWorkspaceOverlay();
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });
    setRect(container.querySelector("[data-ai-workspace-editor='true']"), {
      height: 500,
      left: 300,
      top: 80,
      width: 600
    });
    setRect(container.querySelector(".markdown-paper"), {
      height: 360,
      left: 380,
      top: 118,
      width: 520
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    for (let frame = 0; frame < 8; frame += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }

    expect(screen.queryByTestId("workspace-operation-step-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-operation-cursor")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(screen.queryByTestId("workspace-operation-step-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-operation-cursor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-operation-target")).not.toBeInTheDocument();
  });

  it("uses transform transitions instead of left and top layout animation", () => {
    vi.useFakeTimers();
    const { container } = renderWorkspaceOverlay();
    setRect(container.querySelector("[data-ai-workspace-file-relative-path='topics/alpha.md']"), {
      height: 32,
      left: 40,
      top: 72,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-file-label-relative-path='topics/alpha.md']"), {
      height: 20,
      left: 82,
      top: 78,
      width: 88
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    const cursor = screen.getByTestId("workspace-operation-cursor");
    const target = screen.getByTestId("workspace-operation-target");

    expect(cursor.className).toContain("transition-[transform,opacity]");
    expect(target.className).toContain("transition-[transform,width,height,opacity]");
    expect(target).toHaveStyle({
      transform: "translate3d(40px, 72px, 0)"
    });
  });

  it("does not render over the workspace while the plan is only a preview", () => {
    const { container } = render(
      <WorkspaceOperationOverlay
        events={appliedEvents}
        status="idle"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("does not render when the workspace operation animation is disabled", () => {
    const { container } = render(
      <WorkspaceOperationOverlay
        enabled={false}
        events={liveFileTreeEvents}
        status="applying"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("anchors to a visible parent folder when the target file is not visible", () => {
    const { container } = render(
      <>
        <aside className="markdown-file-tree-slot">
          <section
            className="markdown-file-tree-files"
            data-ai-workspace-file-tree="true"
          >
            <button
              data-ai-workspace-folder-relative-path="docs"
              type="button"
            >
              <span data-ai-workspace-folder-label-relative-path="docs">docs</span>
            </button>
          </section>
        </aside>
        <WorkspaceOperationOverlay
          events={hiddenFileEvents}
          status="applying"
        />
      </>
    );
    setRect(container.querySelector(".markdown-file-tree-slot"), {
      height: 500,
      left: 0,
      top: 0,
      width: 240
    });
    setRect(container.querySelector("[data-ai-workspace-file-tree='true']"), {
      height: 320,
      left: 0,
      top: 240,
      width: 240
    });
    setRect(container.querySelector("[data-ai-workspace-folder-relative-path='docs']"), {
      height: 32,
      left: 24,
      top: 300,
      width: 180
    });
    setRect(container.querySelector("[data-ai-workspace-folder-label-relative-path='docs']"), {
      height: 20,
      left: 88,
      top: 306,
      width: 64
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
      transform: "translate3d(90px, 316px, 0)"
    });
    expect(screen.getByTestId("workspace-operation-target")).toHaveStyle({
      transform: "translate3d(24px, 300px, 0)"
    });
  });

  it("falls back to the file list area instead of the sidebar top for root files", () => {
    const { container } = render(
      <>
        <aside className="markdown-file-tree-slot">Sidebar chrome</aside>
        <section
          className="markdown-file-tree-files"
          data-ai-workspace-file-tree="true"
        >
          File list
        </section>
        <WorkspaceOperationOverlay
          events={hiddenRootFileEvents}
          status="applying"
        />
      </>
    );
    setRect(container.querySelector(".markdown-file-tree-slot"), {
      height: 500,
      left: 0,
      top: 0,
      width: 240
    });
    setRect(container.querySelector("[data-ai-workspace-file-tree='true']"), {
      height: 320,
      left: 0,
      top: 240,
      width: 240
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
      transform: "translate3d(24px, 288px, 0)"
    });
  });

  it("reattaches to a real file row when the row appears after execution starts", async () => {
    const { container } = render(
      <>
        <aside className="markdown-file-tree-slot">Workspace</aside>
        <WorkspaceOperationOverlay
          events={liveFileTreeEvents}
          status="applying"
        />
      </>
    );
    const fileTree = container.querySelector(".markdown-file-tree-slot");
    setRect(fileTree, {
      height: 240,
      left: 10,
      top: 20,
      width: 220
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
      transform: "translate3d(34px, 68px, 0)"
    });

    const fileRow = document.createElement("button");
    fileRow.dataset.aiWorkspaceFileRelativePath = "topics/beta.md";
    fileRow.type = "button";
    setRect(fileRow, {
      height: 32,
      left: 44,
      top: 76,
      width: 180
    });
    const fileLabel = document.createElement("span");
    fileLabel.dataset.aiWorkspaceFileLabelRelativePath = "topics/beta.md";
    fileLabel.textContent = "beta.md";
    setRect(fileLabel, {
      height: 20,
      left: 88,
      top: 82,
      width: 74
    });
    fileRow.appendChild(fileLabel);

    act(() => {
      fileTree?.appendChild(fileRow);
    });

    await waitFor(() => {
      expect(screen.getByTestId("workspace-operation-cursor")).toHaveStyle({
        transform: "translate3d(90px, 92px, 0)"
      });
    });
  });
});
