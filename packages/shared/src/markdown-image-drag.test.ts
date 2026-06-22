import {
  markdownImageDragMarkdownForDocument,
  markdownImageDragPayloadForFile,
  markdownImageDragSrcForDocument,
  readMarkdownImageDragPayload,
  writeMarkdownImageDragPayload
} from "./markdown-image-drag";

function createDragDataTransfer() {
  const data = new Map<string, string>();

  return {
    effectAllowed: "uninitialized",
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => data.set(type, value)
  } as unknown as DataTransfer;
}

describe("markdown image dragging", () => {
  it("builds relative markdown image hrefs with unsafe characters encoded", () => {
    const payload = markdownImageDragPayloadForFile({
      name: "diagram image (v1)#50%.png",
      path: "/vault/assets/diagram image (v1)#50%.png",
      relativePath: "assets/diagram image (v1)#50%.png"
    });

    expect(payload.alt).toBe("diagram image (v1)#50%");
    expect(markdownImageDragSrcForDocument(payload, "/vault/docs/note.md")).toBe(
      "../assets/diagram%20image%20%28v1%29%2350%25.png"
    );
    expect(markdownImageDragMarkdownForDocument(payload, "/vault/docs/note.md")).toBe(
      "![diagram image (v1)#50%](../assets/diagram%20image%20%28v1%29%2350%25.png)"
    );
  });

  it("falls back to the provided relative path when document and image roots differ", () => {
    const payload = markdownImageDragPayloadForFile({
      name: "diagram.png",
      path: "D:/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    });

    expect(markdownImageDragSrcForDocument(payload, "C:/vault/docs/note.md")).toBe("assets/diagram.png");
  });

  it("keeps plain markdown drag data available when custom payload data is rejected", () => {
    const dataTransfer = createDragDataTransfer();
    const originalSetData = dataTransfer.setData.bind(dataTransfer);
    dataTransfer.setData = (type: string, value: string) => {
      if (type === "application/x-markra-markdown-image") throw new Error("custom data unavailable");

      originalSetData(type, value);
    };
    const payload = markdownImageDragPayloadForFile({
      name: "diagram.png",
      path: "/vault/assets/diagram.png",
      relativePath: "assets/diagram.png"
    });

    expect(() => writeMarkdownImageDragPayload(dataTransfer, payload, {
      documentPath: "/vault/docs/note.md"
    })).not.toThrow();

    expect(dataTransfer.getData("text/plain")).toBe("![diagram](../assets/diagram.png)");
    expect(readMarkdownImageDragPayload(dataTransfer)).toBeNull();
  });
});
