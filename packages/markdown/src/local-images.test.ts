import { createMarkdownImageSrcResolver } from "./local-images";

describe("local markdown image paths", () => {
  it("converts relative markdown image paths to local asset URLs beside the current document", () => {
    const resolveImageSrc = createMarkdownImageSrcResolver("/Users/me/notes/today.md", {
      convertFileSrc: (path) => `asset://${path}`
    });

    expect(resolveImageSrc("assets/pasted%20image.png")).toBe("asset:///Users/me/notes/assets/pasted image.png");
  });

  it("resolves relative image paths beside Windows verbatim document paths", () => {
    const resolveImageSrc = createMarkdownImageSrcResolver(String.raw`\\?\C:\mock-vault\notes\today.md`, {
      convertFileSrc: (path) => `asset://${path}`
    });

    expect(resolveImageSrc("assets/pasted-image.png")).toBe(
      String.raw`asset://C:\mock-vault\notes\assets\pasted-image.png`
    );
  });

  it("preserves Windows UNC roots when resolving relative image paths", () => {
    const resolveImageSrc = createMarkdownImageSrcResolver(String.raw`\\mock-server\share\notes\today.md`, {
      convertFileSrc: (path) => `asset://${path}`
    });

    expect(resolveImageSrc("assets/pasted-image.png")).toBe(
      String.raw`asset://\\mock-server\share\notes\assets\pasted-image.png`
    );
  });

  it("leaves remote and data image URLs unchanged", () => {
    const resolveImageSrc = createMarkdownImageSrcResolver("/Users/me/notes/today.md", {
      convertFileSrc: (path) => `asset://${path}`
    });

    expect(resolveImageSrc("https://example.com/logo.png")).toBe("https://example.com/logo.png");
    expect(resolveImageSrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
