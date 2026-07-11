import { useState, type ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiAgentPanel } from "./AiAgentPanel";
import { confirmNativeAiAgentSessionDelete } from "../lib/tauri";
import { agentSessionSummary, assistantMessage, processActivity } from "../test/ai-fixtures";
import type { DraftAiChatAttachment } from "../lib/ai-chat-attachments";

vi.mock("../lib/tauri", () => ({
  confirmNativeAiAgentSessionDelete: vi.fn()
}));

const mockedConfirmNativeAiAgentSessionDelete = vi.mocked(confirmNativeAiAgentSessionDelete);

type AiAgentPanelProps = ComponentProps<typeof AiAgentPanel>;

function renderAgentPanel(props: Partial<AiAgentPanelProps> = {}) {
  return render(
    <AiAgentPanel
      language="en"
      open
      onClose={() => {}}
      {...props}
    />
  );
}

describe("AiAgentPanel", () => {
  beforeEach(() => {
    mockedConfirmNativeAiAgentSessionDelete.mockReset();
    mockedConfirmNativeAiAgentSessionDelete.mockResolvedValue(true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    });
  });

  it("selects, pastes, previews, removes, and sends chat image attachments", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "synthetic.png", { type: "image/png" });
    const draftAttachment: DraftAiChatAttachment = {
      file,
      metadata: {
        height: 1,
        id: "attachment-1",
        mimeType: "image/png",
        name: "synthetic.png",
        size: 3,
        width: 1
      },
      previewUrl: "data:image/png;base64,AQID"
    };
    const addAttachments = vi.fn();
    const removeAttachment = vi.fn();
    const submit = vi.fn();
    const { container } = renderAgentPanel({
      draftAttachments: [draftAttachment],
      messages: [{
        attachmentSources: { "sent-image": "data:image/png;base64,AQID" },
        attachments: [{ ...draftAttachment.metadata, id: "sent-image", name: "sent.png" }],
        id: 1,
        role: "user",
        text: ""
      }],
      onAddAttachments: addAttachments,
      onRemoveAttachment: removeAttachment,
      onSubmit: submit,
      visionAvailable: true
    } as Partial<AiAgentPanelProps>);

    expect(screen.getByRole("button", { name: "Attach images" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "synthetic.png" })).toHaveAttribute("src", draftAttachment.previewUrl);
    expect(screen.getByRole("img", { name: "sent.png" })).toHaveAttribute("src", "data:image/png;base64,AQID");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,image/gif");
    expect(fileInput).toHaveAttribute("multiple");
    fireEvent.change(fileInput!, { target: { files: [file] } });
    expect(addAttachments).toHaveBeenCalledWith([file]);

    fireEvent.paste(screen.getByRole("textbox", { name: "Markra AI message" }), {
      clipboardData: {
        items: [{ getAsFile: () => file, kind: "file", type: "image/png" }]
      }
    });
    expect(addAttachments).toHaveBeenLastCalledWith([file]);

    fireEvent.click(screen.getByRole("button", { name: "Remove image: synthetic.png" }));
    expect(removeAttachment).toHaveBeenCalledWith("attachment-1");

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("keeps image drafts visible but blocks send when vision is unavailable", () => {
    const file = new File([new Uint8Array([1])], "synthetic.png", { type: "image/png" });

    renderAgentPanel({
      draftAttachments: [{
        file,
        metadata: {
          height: 1,
          id: "attachment-1",
          mimeType: "image/png",
          name: "synthetic.png",
          size: 1,
          width: 1
        },
        previewUrl: "data:image/png;base64,AQ=="
      }],
      visionAvailable: false
    } as Partial<AiAgentPanelProps>);

    expect(screen.getByRole("img", { name: "synthetic.png" })).toBeInTheDocument();
    expect(screen.getByText("Choose a model with vision to send images.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach images" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("renders a focused right-side agent workspace", () => {
    const close = vi.fn();
    const { container } = renderAgentPanel({
      modelName: "GPT-5.5",
      providerName: "OpenAI",
      onClose: close
    });

    expect(screen.getByRole("complementary", { name: "Markra AI" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Markra AI" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI · GPT-5.5")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Markra AI message" })).toHaveAttribute("placeholder", "Ask Markra AI...");
    expect(screen.getByRole("button", { name: "Close Markra AI" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Markra AI" })).toHaveClass("z-30");
    expect(container.querySelector(".ai-agent-panel")).toHaveClass("border-l");
    expect(container.querySelector(".ai-agent-panel")).toHaveClass("z-20");

    fireEvent.click(screen.getByRole("button", { name: "Close Markra AI" }));

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("shows a compact workspace plan confirmation above the composer without the runner panel", () => {
    renderAgentPanel({
      workspacePlanEvents: [
        {
          totalSteps: 1,
          type: "plan_validating"
        },
        {
          action: "create_note",
          afterContent: "# Alpha",
          index: 0,
          label: "Create note: topics/alpha.md",
          path: "topics/alpha.md",
          target: "file_tree",
          type: "step_previewed"
        }
      ]
    });

    const confirmation = screen.getByRole("region", { name: "Workspace plan confirmation" });

    expect(confirmation).toBeInTheDocument();
    expect(confirmation.closest("form")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "AI workspace actions" })).not.toBeInTheDocument();
    expect(screen.queryByText("AI cursor")).not.toBeInTheDocument();
    expect(confirmation).toHaveTextContent("Create note: topics/alpha.md");
  });

  it("offers a confirmed apply action for prepared workspace plans", () => {
    const applyWorkspacePlan = vi.fn();

    renderAgentPanel({
      workspacePlanApplyStatus: "idle",
      workspacePlanEvents: [
        {
          totalSteps: 1,
          type: "plan_validating"
        },
        {
          action: "create_note",
          afterContent: "# Alpha",
          index: 0,
          label: "Create note: topics/alpha.md",
          path: "topics/alpha.md",
          target: "file_tree",
          type: "step_previewed"
        }
      ],
      onApplyWorkspacePlan: applyWorkspacePlan
    } as Partial<AiAgentPanelProps>);

    fireEvent.click(screen.getByRole("button", { name: "Apply workspace plan" }));

    expect(applyWorkspacePlan).toHaveBeenCalledTimes(1);
  });

  it("renders a compact ACP permission prompt above the composer", () => {
    const resolvePermission = vi.fn();

    renderAgentPanel({
      pendingAcpPermission: {
        detail: "notes/example.md",
        id: "permission-1",
        options: [
          { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
          { kind: "reject_once", name: "Reject once", optionId: "reject_once" }
        ],
        title: "Permission requested: Write file"
      },
      onResolveAcpPermission: resolvePermission
    } as Partial<AiAgentPanelProps>);

    const prompt = screen.getByRole("region", { name: "ACP permission request" });

    expect(prompt).toBeInTheDocument();
    expect(prompt.closest("form")).toBeInTheDocument();
    expect(prompt).toHaveTextContent("Permission requested: Write file");
    expect(prompt).toHaveTextContent("notes/example.md");

    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));

    expect(resolvePermission).toHaveBeenCalledWith({
      optionId: "allow_once",
      outcome: "selected"
    });
  });

  it("disables workspace plan apply while execution is running", () => {
    renderAgentPanel({
      workspacePlanApplyStatus: "applying",
      workspacePlanEvents: [
        {
          totalSteps: 1,
          type: "plan_validating"
        },
        {
          action: "update_note",
          index: 0,
          label: "Update note: alpha.md",
          path: "alpha.md",
          target: "editor",
          type: "step_started"
        }
      ],
      onApplyWorkspacePlan: () => {}
    } as Partial<AiAgentPanelProps>);

    expect(screen.getByRole("button", { name: "Apply workspace plan" })).toBeDisabled();
    expect(screen.getByText("Applying")).toBeInTheDocument();
  });

  it("lets users dismiss the completed workspace plan confirmation", () => {
    renderAgentPanel({
      workspacePlanApplyStatus: "applied",
      workspacePlanEvents: [
        {
          totalSteps: 1,
          type: "plan_validating"
        },
        {
          action: "move_note",
          index: 0,
          label: "Move note: drafts/example.md -> notes/example.md",
          target: "file_tree",
          type: "step_applied"
        }
      ]
    });

    expect(screen.getByRole("region", { name: "Workspace plan confirmation" })).toHaveTextContent("Applied");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss workspace plan confirmation" }));

    expect(screen.queryByRole("region", { name: "Workspace plan confirmation" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Markra AI message" })).toBeInTheDocument();
  });

  it("shows the current turn context in a collapsible panel", () => {
    renderAgentPanel({
      context: {
        documentName: "synthetic.md",
        headingCount: 2,
        messageCount: 4,
        sectionCount: 2,
        selectionChars: 12,
        sessionId: "session-synthetic",
        tableCount: 1
      }
    });

    const contextButton = screen.getByRole("button", { name: "Current context" });
    expect(contextButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("synthetic.md")).not.toBeInTheDocument();

    fireEvent.click(contextButton);

    expect(contextButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("synthetic.md")).toBeInTheDocument();
    expect(screen.getByText("12 chars")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("session-synthetic")).toBeInTheDocument();
    expect(screen.getByText("2 headings · 2 sections · 1 tables")).toBeInTheDocument();
  });

  it("collapses the agent panel from the leading bot button", () => {
    const close = vi.fn();
    const { container } = renderAgentPanel({
      modelName: "GPT-5.5",
      providerName: "OpenAI",
      onClose: close
    });

    const collapseButton = screen.getByRole("button", { name: "Collapse Markra AI" });

    expect(collapseButton).toContainElement(container.querySelector(".lucide-bot"));

    fireEvent.click(collapseButton);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("shows workspace sessions in the header menu and lets us switch or create one", async () => {
    const selectSession = vi.fn();
    const createSession = vi.fn();
    const renameSession = vi.fn();
    const deleteSession = vi.fn();

    renderAgentPanel({
      activeSessionId: "session-b",
      sessions: [
        agentSessionSummary({
          id: "session-a",
          messageCount: 3,
          title: "Summarize API changes",
          titleSource: "ai"
        }),
        agentSessionSummary({
          createdAt: 2,
          id: "session-b",
          title: null,
          titleSource: null,
          updatedAt: 20
        })
      ],
      onCreateSession: createSession,
      onDeleteSession: deleteSession,
      onRenameSession: renameSession,
      onSelectSession: selectSession
    });

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));

    expect(screen.getByRole("menu", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "New session" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Summarize API changes/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /New session/i })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("menuitemradio", { name: /Summarize API changes/i }));
    expect(selectSession).toHaveBeenCalledWith("session-a");

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New session" }));
    expect(createSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename session Summarize API changes" }));
    const renameInput = screen.getByRole("textbox", { name: "Rename session input" });
    fireEvent.change(renameInput, { target: { value: "Investigate gold price mismatch" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });
    expect(renameSession).toHaveBeenCalledWith("session-a", "Investigate gold price mismatch");

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete session New session" }));
    expect(screen.queryByRole("dialog", { name: "Delete this session?" })).not.toBeInTheDocument();
    expect(mockedConfirmNativeAiAgentSessionDelete).toHaveBeenCalledWith("New session", {
      cancelLabel: "Cancel delete",
      message: "Delete this session?",
      okLabel: "Confirm delete"
    });
    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith("session-b"));
  });

  it("filters and archives workspace sessions from the header menu", () => {
    const archiveSession = vi.fn();

    renderAgentPanel({
      activeSessionId: "session-a",
      sessions: [
        agentSessionSummary({
          messageCount: 3,
          title: "Gold audit",
          titleSource: "ai",
          updatedAt: 30
        }),
        agentSessionSummary({
          createdAt: 2,
          id: "session-b",
          title: "API review",
          titleSource: "fallback",
          updatedAt: 20
        }),
        agentSessionSummary({
          archivedAt: 40,
          createdAt: 3,
          id: "session-c",
          title: "Archived note"
        })
      ],
      onArchiveSession: archiveSession
    });

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("menuitemradio", { name: /Gold audit/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /API review/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio", { name: /Archived note/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "api" }
    });

    expect(screen.queryByRole("menuitemradio", { name: /Gold audit/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /API review/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sessions" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Show archived sessions" }));
    expect(screen.getByRole("menuitemradio", { name: /Archived note/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archive session API review" }));
    expect(archiveSession).toHaveBeenCalledWith("session-b", true);

    fireEvent.click(screen.getByRole("button", { name: "Restore session Archived note" }));
    expect(archiveSession).toHaveBeenCalledWith("session-c", false);
  });

  it("keeps a session when native delete confirmation is cancelled", async () => {
    const deleteSession = vi.fn();
    mockedConfirmNativeAiAgentSessionDelete.mockResolvedValue(false);

    renderAgentPanel({
      activeSessionId: "session-a",
      sessions: [agentSessionSummary({ title: "Keep this" })],
      onDeleteSession: deleteSession
    });

    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete session Keep this" }));

    await waitFor(() => expect(mockedConfirmNativeAiAgentSessionDelete).toHaveBeenCalledTimes(1));
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("keeps typed messages in the agent transcript", () => {
    function Harness() {
      const [draft, setDraft] = useState("");
      const [messages, setMessages] = useState<{ id: number; role: "assistant" | "user"; text: string }[]>([]);

      return (
        <AiAgentPanel
          draft={draft}
          language="en"
          messages={messages}
          modelName="GPT-5.5"
          open
          providerName="OpenAI"
          onClose={() => {}}
          onDraftChange={setDraft}
          onSubmit={(promptOverride) => {
            const text = (promptOverride ?? draft).trim();
            if (!text) return;

            setMessages((currentMessages) => [
              ...currentMessages,
              { id: currentMessages.length + 1, role: "user", text },
              { id: currentMessages.length + 2, role: "assistant", text: "Ready for the next step." }
            ]);
            setDraft("");
          }}
        />
      );
    }

    render(
      <Harness />
    );

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    fireEvent.change(input, { target: { value: "Summarize this note" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Summarize this note")).toBeInTheDocument();
    expect(screen.getByText("Ready for the next step.")).toBeInTheDocument();
    expect(screen.getByText("Summarize this note").closest("li")).toHaveClass("ml-auto", "max-w-[82%]");
    expect(screen.getByText("Summarize this note").closest(".ai-chat-markdown")?.parentElement).toHaveClass("rounded-lg");
    expect(screen.getByText("Ready for the next step.").closest("li")).toHaveClass("mr-auto", "max-w-[86%]");
    expect(input).toHaveValue("");
  });

  it("offers copy, edit, and retry actions on transcript messages", async () => {
    const updateDraft = vi.fn();
    const retryMessage = vi.fn();
    const writeText = vi.mocked(navigator.clipboard.writeText);
    const props: Partial<AiAgentPanelProps> = {
      draft: "Existing draft",
      messages: [
        { id: 1, role: "user" as const, text: "Summarize synthetic notes" },
        { id: 2, role: "assistant" as const, text: "Synthetic answer." }
      ],
      onDraftChange: updateDraft,
      onRetryMessage: retryMessage
    };

    renderAgentPanel(props);

    const copyButtons = screen.getAllByRole("button", { name: "Copy message" });

    fireEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith("Summarize synthetic notes");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());

    const editButton = screen.getByRole("button", { name: "Edit message" });
    fireEvent.click(editButton);
    expect(updateDraft).toHaveBeenCalledWith("Summarize synthetic notes");
    expect(editButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Summarize synthetic notes").closest(".ai-chat-markdown")?.parentElement).toHaveClass("ring-2");

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    const cancelEditButton = screen.getByRole("button", { name: "Cancel edit" });
    cancelEditButton.focus();
    fireEvent.click(cancelEditButton);
    expect(updateDraft).toHaveBeenCalledWith("Existing draft");
    expect(screen.queryByRole("button", { name: "Cancel edit" })).not.toBeInTheDocument();
    expect(screen.getByText("Summarize synthetic notes").closest(".ai-chat-markdown")?.parentElement).not.toHaveClass("ring-2");
    await waitFor(() => expect(input).not.toHaveFocus());

    fireEvent.click(copyButtons[1]);
    expect(writeText).toHaveBeenCalledWith("Synthetic answer.");

    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    expect(retryMessage).toHaveBeenCalledWith(2);
  });

  it("submits an edited user message as a reset from that turn", () => {
    const submit = vi.fn();
    const submitEditedMessage = vi.fn();

    function Harness() {
      const [draft, setDraft] = useState("");

      return (
        <AiAgentPanel
          draft={draft}
          language="en"
          messages={[
            { id: 1, role: "user", text: "Summarize synthetic notes" },
            { id: 2, role: "assistant", text: "Initial synthetic answer." }
          ]}
          open
          onClose={() => {}}
          onDraftChange={setDraft}
          onSubmit={submit}
          onSubmitEditedMessage={submitEditedMessage}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    expect(input).toHaveValue("Summarize synthetic notes");

    fireEvent.change(input, { target: { value: "Summarize updated synthetic notes" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(submit).not.toHaveBeenCalled();
    expect(submitEditedMessage).toHaveBeenCalledWith(1, "Summarize updated synthetic notes");
  });

  it("does not allow sending when no document is available", () => {
    const submit = vi.fn();
    const updateDraft = vi.fn();

    renderAgentPanel({
      documentAvailable: false,
      draft: "Summarize this note",
      onDraftChange: updateDraft,
      onSubmit: submit
    });

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    const suggestion = screen.getByRole("button", { name: "Summarize this document" });

    expect(screen.getByText("Open a Markdown document to chat")).toBeInTheDocument();
    expect(screen.getByText("Select a file from the sidebar or create a new Markdown document first.")).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Open a Markdown document first");
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(suggestion).toBeDisabled();

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(sendButton);
    fireEvent.click(suggestion);

    expect(updateDraft).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("allows freeform AI chat when only a workspace is available", () => {
    const submit = vi.fn();
    const updateDraft = vi.fn();

    renderAgentPanel({
      documentAvailable: false,
      draft: "List workspace notes",
      onDraftChange: updateDraft,
      onSubmit: submit,
      workspaceAvailable: true
    });

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    const sendButton = screen.getByRole("button", { name: "Send message" });
    const suggestion = screen.getByRole("button", { name: "Summarize this document" });

    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Ask Markra AI...");
    expect(input).toBeEnabled();
    expect(sendButton).toBeEnabled();
    expect(suggestion).toBeDisabled();

    fireEvent.change(input, { target: { value: "Show markdown files" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateDraft).toHaveBeenCalledWith("Show markdown files");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("does not send when Enter confirms an IME composition", () => {
    function Harness() {
      const [draft, setDraft] = useState("Which AI models are available?");
      const [messages, setMessages] = useState<{ id: number; role: "assistant" | "user"; text: string }[]>([]);

      return (
        <AiAgentPanel
          draft={draft}
          language="en"
          messages={messages}
          open
          onClose={() => {}}
          onDraftChange={setDraft}
          onSubmit={(promptOverride) => {
            const text = (promptOverride ?? draft).trim();
            if (!text) return;

            setMessages((currentMessages) => [...currentMessages, { id: currentMessages.length + 1, role: "user", text }]);
            setDraft("");
          }}
        />
      );
    }

    render(<Harness />);

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: "Enter", nativeEvent: { isComposing: true, keyCode: 229 } });
    fireEvent.compositionEnd(input);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(input).toHaveValue("Which AI models are available?");
  });

  it("keeps the transcript scrolled to the newest streamed message", async () => {
    const initialMessage = {
      id: 1,
      role: "assistant" as const,
      text: "First chunk"
    };
    const { rerender } = renderAgentPanel({
      messages: [initialMessage],
      status: "streaming"
    });
    const transcript = screen.getByRole("log", { name: "Markra AI" });

    Object.defineProperty(transcript, "scrollHeight", {
      configurable: true,
      value: 640
    });
    transcript.scrollTop = 12;

    rerender(
      <AiAgentPanel
        language="en"
        messages={[
          {
            ...initialMessage,
            text: "First chunk plus the streamed ending"
          }
        ]}
        open
        status="streaming"
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(transcript.scrollTop).toBe(640));
  });

  it("does not force the transcript to the bottom after the user scrolls up during streaming", async () => {
    const initialMessage = {
      id: 1,
      role: "assistant" as const,
      text: "First chunk"
    };
    const { rerender } = renderAgentPanel({
      messages: [initialMessage],
      status: "streaming"
    });
    const transcript = screen.getByRole("log", { name: "Markra AI" });

    Object.defineProperty(transcript, "clientHeight", {
      configurable: true,
      value: 240
    });
    Object.defineProperty(transcript, "scrollHeight", {
      configurable: true,
      value: 960
    });
    transcript.scrollTop = 120;
    fireEvent.scroll(transcript);

    rerender(
      <AiAgentPanel
        language="en"
        messages={[
          {
            ...initialMessage,
            text: "First chunk plus a streamed update"
          }
        ]}
        open
        status="streaming"
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(transcript.scrollTop).toBe(120));
  });

  it("keeps the composer text aligned without a leading icon column", () => {
    const { container } = renderAgentPanel({
      modelName: "GPT-5.5",
      providerName: "OpenAI"
    });

    const input = screen.getByRole("textbox", { name: "Markra AI message" });
    const sendButton = screen.getByRole("button", { name: "Send message" });

    expect(input).toHaveClass("w-full");
    expect(input).not.toHaveClass("pr-10");
    expect(sendButton).not.toHaveClass("absolute");
    expect(container.querySelector("form .lucide-sparkles")).not.toBeInTheDocument();
  });

  it("shows an animated composer border only while the agent is running", () => {
    const { container, rerender } = renderAgentPanel({
      modelName: "GPT-5.5",
      providerName: "OpenAI",
      status: "idle"
    });

    const composer = container.querySelector(".ai-agent-composer");

    expect(composer).toBeInTheDocument();
    expect(composer).not.toHaveClass("ai-agent-composer-running");

    rerender(
      <AiAgentPanel
        language="en"
        modelName="GPT-5.5"
        open
        providerName="OpenAI"
        status="streaming"
        onClose={() => {}}
      />
    );

    expect(container.querySelector(".ai-agent-composer")).toHaveClass("ai-agent-composer-running");
  });

  it("lets the right-side agent panel be resized from its left edge", () => {
    const resize = vi.fn();
    const resizeEnd = vi.fn();
    const resizeStart = vi.fn();
    renderAgentPanel({
      maxWidth: 640,
      minWidth: 320,
      modelName: "GPT-5.5",
      providerName: "OpenAI",
      width: 420,
      onResize: resize,
      onResizeEnd: resizeEnd,
      onResizeStart: resizeStart
    });

    const handle = screen.getByRole("separator", { name: "Resize Markra AI" });

    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 20 });
    fireEvent.pointerMove(window, { clientX: -400 });
    fireEvent.pointerMove(window, { clientX: 260 });
    fireEvent.pointerUp(window);

    expect(resizeStart).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenNthCalledWith(1, 500);
    expect(resize).toHaveBeenNthCalledWith(2, 640);
    expect(resize).toHaveBeenNthCalledWith(3, 320);
    expect(resizeEnd).toHaveBeenCalledTimes(1);
    expect(handle).toHaveAttribute("aria-valuemin", "320");
    expect(handle).toHaveAttribute("aria-valuemax", "640");
    expect(handle).toHaveAttribute("aria-valuenow", "420");
    expect(handle).toHaveClass("top-10", "bottom-0");
    expect(handle).not.toHaveClass("hover:[&>span]:bg-(--accent)", "focus-visible:[&>span]:bg-(--accent)");
    expect(handle.querySelector("span")).not.toBeInTheDocument();
  });

  it("switches models and toggles supported agent modes", () => {
    const selectModel = vi.fn();
    function Harness() {
      const [thinkingEnabled, setThinkingEnabled] = useState(false);
      const [webSearchEnabled, setWebSearchEnabled] = useState(false);

      return (
        <AiAgentPanel
          availableModels={[
            {
              capabilities: ["text", "reasoning", "web"],
              id: "gpt-5.5",
              name: "GPT-5.5",
              providerId: "openai",
              providerName: "OpenAI",
              providerType: "openai"
            },
            {
              capabilities: ["text"],
              id: "claude-sonnet-4-6",
              name: "Claude Sonnet 4.6",
              providerId: "anthropic",
              providerName: "Anthropic",
              providerType: "anthropic"
            }
          ]}
          language="en"
          open
          selectedModelId="gpt-5.5"
          selectedProviderId="openai"
          thinkingEnabled={thinkingEnabled}
          webSearchAvailable
          webSearchEnabled={webSearchEnabled}
          onClose={() => {}}
          onSelectModel={selectModel}
          onToggleThinking={() => setThinkingEnabled((enabled) => !enabled)}
          onToggleWebSearch={() => setWebSearchEnabled((enabled) => !enabled)}
        />
      );
    }

    render(
      <Harness />
    );

    const deepThinking = screen.getByRole("button", { name: "Deep thinking" });
    const webSearch = screen.getByRole("button", { name: "Web search" });
    const modelSelector = screen.getByRole("combobox", { name: "AI model" });

    fireEvent.click(deepThinking);
    fireEvent.click(webSearch);
    fireEvent.click(modelSelector);
    expect(screen.getByAltText("Anthropic logo")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("option")[1]!);

    expect(deepThinking).toHaveAttribute("aria-pressed", "true");
    expect(webSearch).toHaveAttribute("aria-pressed", "true");
    expect(selectModel).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-6");
  });

  it("marks the header when ACP agent mode is active", () => {
    renderAgentPanel({
      acpAgentEnabled: true,
      acpAgentName: "Codex ACP",
      modelName: "GPT-5.5",
      providerName: "OpenAI"
    });

    expect(screen.getByText("ACP · Codex ACP")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI · GPT-5.5")).not.toBeInTheDocument();
  });

  it("hides provider-only mode controls while ACP agent mode is active", () => {
    const disableThinking = vi.fn();
    const toggleWebSearch = vi.fn();

    renderAgentPanel({
      acpAgentEnabled: true,
      acpAgentName: "Codex ACP",
      availableModels: [
        {
          capabilities: ["text", "reasoning", "web"],
          id: "gpt-5.5",
          name: "GPT-5.5",
          providerId: "openai",
          providerName: "OpenAI",
          providerType: "openai"
        }
      ],
      selectedModelId: "gpt-5.5",
      selectedProviderId: "openai",
      thinkingEnabled: true,
      webSearchAvailable: true,
      webSearchEnabled: true,
      onDisableThinking: disableThinking,
      onToggleWebSearch: toggleWebSearch
    });

    expect(screen.queryByRole("button", { name: "Deep thinking" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Web search" })).not.toBeInTheDocument();
    expect(disableThinking).not.toHaveBeenCalled();
    expect(toggleWebSearch).not.toHaveBeenCalled();
  });

  it("shows and selects ACP-supported models in the header", () => {
    const selectAcpModel = vi.fn();

    renderAgentPanel({
      acpAgentEnabled: true,
      acpModels: [
        { id: "gpt-5.5", name: "GPT-5.5" },
        { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }
      ],
      selectedAcpModelId: "gpt-5.5",
      onSelectAcpModel: selectAcpModel
    });

    const selector = screen.getByRole("combobox", { name: "ACP model" });

    expect(selector).toHaveTextContent("ACP · GPT-5.5");
    expect(screen.queryByText("AC")).not.toBeInTheDocument();
    fireEvent.click(selector);
    expect(screen.queryByText("AC")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Claude Sonnet 4.6/ }));

    expect(selectAcpModel).toHaveBeenCalledWith("claude-sonnet-4-6");
  });

  it("disables agent modes that the selected model does not support", () => {
    renderAgentPanel({
      availableModels: [
        {
          capabilities: ["text"],
          id: "llama3.3",
          name: "Llama 3.3",
          providerId: "ollama",
          providerName: "Ollama",
          providerType: "ollama"
        }
      ],
      selectedModelId: "llama3.3",
      selectedProviderId: "ollama",
      onSelectModel: () => {}
    });

    expect(screen.getByRole("button", { name: "Deep thinking" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Web search" })).toBeDisabled();
  });

  it("renders assistant chat bubbles as markdown", () => {
    renderAgentPanel({
      messages: [assistantMessage({ text: "**Bold**\n\n- First item" })]
    });

    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getByText("First item").closest("ul")).toBeInTheDocument();
  });

  it("renders assistant errors with a danger bubble treatment", () => {
    renderAgentPanel({
      messages: [assistantMessage({ isError: true, text: "Concurrency limit exceeded." })]
    });

    const bubble = screen.getByText("Concurrency limit exceeded.").closest(".ai-chat-markdown")?.parentElement;

    if (!bubble) throw new Error("Expected assistant error bubble");
    expect(bubble).toHaveClass("border-(--danger)");
    expect(bubble).toHaveClass("bg-(--bg-primary)");
    expect(bubble).toHaveClass("text-(--danger)");
    expect(screen.getByText("Concurrency limit exceeded.").closest(".ai-chat-markdown")).toHaveClass("ai-chat-markdown-danger");
  });

  it("renders visible process steps for assistant messages", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          activities: [
            processActivity({
              detail: "Requested tool calls",
              id: "call:1",
              kind: "ai_call",
              label: "AI call 1"
            }),
            processActivity({
              id: "assistant:1",
              kind: "assistant_message",
              label: "I'll inspect the current document first."
            }),
            processActivity({
              detail: "42 chars",
              rawLabel: "get_document",
              status: "running"
            }),
            processActivity({
              id: "call:2",
              kind: "ai_call",
              label: "AI call 2",
              status: "running",
              turn: 2
            })
          ]
        })
      ]
    });

    expect(screen.queryByText("AI call 1")).not.toBeInTheDocument();
    expect(screen.queryByText("AI call 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Requested tool calls")).not.toBeInTheDocument();
    expect(screen.getByText("I'll inspect the current document first.")).toBeInTheDocument();
    expect(screen.getByText("Read current document")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("get_document")).not.toBeInTheDocument();
    expect(screen.queryByText("42 chars")).not.toBeInTheDocument();
    expect(screen.getByText("Ready.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Read current document/i }));

    expect(screen.getByText("get_document")).toBeInTheDocument();
    expect(screen.getByText("42 chars")).toBeInTheDocument();
  });

  it("shows a thinking bubble while the hidden AI call is still running", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          activities: [
            processActivity({
              id: "call:1",
              kind: "ai_call",
              label: "AI call 1",
              status: "running"
            })
          ],
          text: ""
        })
      ],
      status: "thinking"
    });

    expect(screen.getByText("Thinking")).toBeInTheDocument();
  });

  it("shows a completed thinking section alongside the final assistant answer", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          text: "Final answer.",
          thinking: "Checking the document before answering."
        })
      ]
    });

    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Checking the document before answering.")).not.toBeInTheDocument();
    expect(screen.getByText("Final answer.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thinking" }));

    expect(screen.getByText("Checking the document before answering.")).toBeInTheDocument();
  });

  it("shows multiple preserved thinking rounds in the same assistant reply", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          text: "Final answer.",
          thinking: "Preparing the insertion near the end of the document.",
          thinkingTurns: [
            "Inspecting the document structure.",
            "Preparing the insertion near the end of the document."
          ]
        })
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: "Thinking" }));

    expect(screen.getByText("Inspecting the document structure.")).toBeInTheDocument();
    expect(screen.getByText("Preparing the insertion near the end of the document.")).toBeInTheDocument();
    expect(screen.getByText("Final answer.")).toBeInTheDocument();
  });

  it("keeps assistant transcript rows shrinkable when thinking content is long", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          text: "Final answer.",
          thinking: "A long thinking block with inline code and links."
        })
      ]
    });

    expect(screen.getByText("Final answer.").closest("li")).toHaveClass("min-w-0");
  });

  it("lets streamed thinking content collapse and expand", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          text: "Final answer.",
          thinking: "Checking the document before answering."
        })
      ]
    });

    fireEvent.click(screen.getByRole("button", { name: "Thinking" }));

    expect(screen.getByText("Checking the document before answering.")).toBeInTheDocument();
    expect(screen.getByText("Final answer.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thinking" }));

    expect(screen.queryByText("Checking the document before answering.")).not.toBeInTheDocument();
    expect(screen.getByText("Final answer.")).toBeInTheDocument();
  });

  it("keeps thinking open while a turn is running and collapses it when the turn completes", async () => {
    const runningActivities = [
      processActivity({
        id: "tool:1",
        kind: "tool_call",
        label: "Read current document",
        status: "running"
      })
    ];
    const runningMessage = assistantMessage({
      activities: runningActivities,
      text: "",
      thinking: "Checking the document before answering."
    });
    const { rerender } = renderAgentPanel({
      messages: [runningMessage],
      status: "thinking"
    });

    expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Checking the document before answering.")).toBeInTheDocument();

    rerender(
      <AiAgentPanel
        language="en"
        messages={[
          {
            ...runningMessage,
            activities: runningActivities.map((activity) => ({ ...activity, status: "completed" as const })),
            text: "Final answer."
          }
        ]}
        open
        status="idle"
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("Checking the document before answering.")).not.toBeInTheDocument();
    expect(screen.getByText("Final answer.")).toBeInTheDocument();
  });

  it("does not force a completed thinking block closed again after the user re-expands it", async () => {
    const completedMessage = assistantMessage({
      text: "Final answer.",
      thinking: "Checking the document before answering."
    });
    const { rerender } = renderAgentPanel({
      messages: [completedMessage]
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "false"));

    fireEvent.click(screen.getByRole("button", { name: "Thinking" }));

    expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Checking the document before answering.")).toBeInTheDocument();

    rerender(
      <AiAgentPanel
        language="en"
        messages={[completedMessage]}
        open
        onClose={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Thinking" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Checking the document before answering.")).toBeInTheDocument();
  });

  it("collapses completed process flow and allows expanding it later", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          activities: [
            processActivity({
              id: "assistant:1",
              kind: "assistant_message",
              label: "I checked the document first."
            }),
            processActivity({
              detail: "42 chars",
              rawLabel: "get_document"
            })
          ]
        })
      ]
    });

    expect(screen.getByRole("button", { name: /2 steps/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("I checked the document first.")).not.toBeInTheDocument();
    expect(screen.queryByText("Read current document")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 steps/i }));

    expect(screen.getByRole("button", { name: /2 steps/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("I checked the document first.")).toBeInTheDocument();
    expect(screen.getByText("Read current document")).toBeInTheDocument();
  });

  it("keeps process flow open while running and collapses it when the run completes", async () => {
    const runningActivities = [
      processActivity({
        id: "assistant:1",
        kind: "assistant_message",
        label: "I am checking the current document.",
        status: "completed"
      }),
      processActivity({
        id: "tool:1",
        kind: "tool_call",
        label: "Read current document",
        status: "running"
      })
    ];
    const runningMessage = assistantMessage({
      activities: runningActivities,
      text: "Ready."
    });
    const completedMessage = {
      ...runningMessage,
      activities: runningActivities.map((activity) => ({ ...activity, status: "completed" as const }))
    };
    const { rerender } = renderAgentPanel({
      messages: [runningMessage]
    });

    expect(screen.queryByRole("button", { name: /2 steps/i })).not.toBeInTheDocument();
    expect(screen.getByText("I am checking the current document.")).toBeInTheDocument();
    expect(screen.getByText("Read current document")).toBeInTheDocument();

    rerender(
      <AiAgentPanel
        language="en"
        messages={[completedMessage]}
        open
        onClose={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /2 steps/i })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("I am checking the current document.")).not.toBeInTheDocument();
    expect(screen.queryByText("Read current document")).not.toBeInTheDocument();
  });

  it("keeps process flow open until every hidden AI call has completed", () => {
    renderAgentPanel({
      messages: [
        assistantMessage({
          activities: [
            processActivity({
              id: "call:1",
              kind: "ai_call",
              label: "AI call 1"
            }),
            processActivity({
              id: "assistant:1",
              kind: "assistant_message",
              label: "I inspected the section."
            }),
            processActivity({
              detail: "section:2",
              label: "Locate section"
            }),
            processActivity({
              id: "call:2",
              kind: "ai_call",
              label: "AI call 2",
              status: "running",
              turn: 2
            })
          ],
          text: ""
        })
      ]
    });

    expect(screen.queryByRole("button", { name: /2 steps/i })).not.toBeInTheDocument();
    expect(screen.getByText("I inspected the section.")).toBeInTheDocument();
    expect(screen.getByText("Locate section")).toBeInTheDocument();
  });
});
