import {
  createAiAgentSessionTitle,
  createDefaultAiAgentSessionState,
  normalizeStoredAiAgentSessionState
} from "./session-state";

describe("AI agent session state", () => {
  it("keeps validated image attachment metadata on stored messages", () => {
    const session = normalizeStoredAiAgentSessionState({
      messages: [
        {
          attachments: [
            {
              height: 480,
              id: "attachment-1",
              mimeType: "image/png",
              name: "Synthetic diagram.png",
              size: 3,
              width: 640
            }
          ],
          id: 1,
          role: "user",
          text: "Describe this image"
        }
      ]
    });

    expect(session.messages[0]?.attachments).toEqual([
      {
        height: 480,
        id: "attachment-1",
        mimeType: "image/png",
        name: "Synthetic diagram.png",
        size: 3,
        width: 640
      }
    ]);
  });

  it("drops malformed attachment metadata and limits each message to four images", () => {
    const validAttachment = {
      height: 1,
      id: "attachment",
      mimeType: "image/webp",
      name: "pixel.webp",
      size: 1,
      width: 1
    };
    const session = normalizeStoredAiAgentSessionState({
      messages: [
        {
          attachments: [
            { ...validAttachment, id: "../unsafe" },
            { ...validAttachment, id: "unsupported", mimeType: "image/svg+xml" },
            { ...validAttachment, height: 0, id: "zero-height" },
            { ...validAttachment, id: "empty-name", name: " " },
            ...Array.from({ length: 5 }, (_, index) => ({
              ...validAttachment,
              id: `attachment-${index + 1}`
            }))
          ],
          id: 2,
          role: "user",
          text: ""
        }
      ]
    });

    expect(session.messages[0]?.attachments?.map((attachment) => attachment.id)).toEqual([
      "attachment-1",
      "attachment-2",
      "attachment-3",
      "attachment-4"
    ]);
  });

  it("stores the last agent model selection with the session", () => {
    expect(createDefaultAiAgentSessionState({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek",
      thinkingEnabled: true,
      webSearchEnabled: true
    })).toMatchObject({
      agentModelId: "deepseek-v4-flash",
      agentProviderId: "deepseek",
      thinkingEnabled: true,
      webSearchEnabled: true
    });

    expect(normalizeStoredAiAgentSessionState({
      agentModelId: " gpt-5.5 ",
      agentProviderId: " openai ",
      draft: "",
      messages: [],
      panelOpen: false,
      panelWidth: null,
      thinkingEnabled: true,
      webSearchEnabled: false
    })).toMatchObject({
      agentModelId: "gpt-5.5",
      agentProviderId: "openai",
      thinkingEnabled: true,
      webSearchEnabled: false
    });
  });

  it("uses an image conversation title when the first user turn only has attachments", () => {
    expect(createAiAgentSessionTitle(normalizeStoredAiAgentSessionState({
      messages: [
        {
          attachments: [
            {
              height: 1,
              id: "attachment-1",
              mimeType: "image/png",
              name: "pixel.png",
              size: 1,
              width: 1
            }
          ],
          id: 1,
          role: "user",
          text: ""
        }
      ]
    }))).toBe("Image conversation");
  });
});
