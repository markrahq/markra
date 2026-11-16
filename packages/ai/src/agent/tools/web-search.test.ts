// @vitest-environment jsdom

import {
  extractReadableWebContent,
  parseBingSearchResults,
  parseSearxngSearchResults,
  runCherryStyleWebSearch,
  webSearchSettingsAreUsable,
  type WebSearchTransport
} from "./web-search";

describe("webSearch", () => {
  it("extracts readable markdown content from HTML", () => {
    const extracted = extractReadableWebContent(
      [
        "<html><head><title>Ignored shell title</title></head><body>",
        "<nav>navigation</nav>",
        "<article><h1>Launch notes</h1><p>Markra can now read pages.</p><script>bad()</script></article>",
        "</body></html>"
      ].join(""),
      "https://example.com/post",
      2000
    );

    expect(extracted.title).toBe("Launch notes");
    expect(extracted.content).toContain("# Launch notes");
    expect(extracted.content).toContain("Markra can now read pages.");
    expect(extracted.content).not.toContain("navigation");
    expect(extracted.content).not.toContain("bad()");
  });

  it("parses Bing search result links from a rendered search page", () => {
    const results = parseBingSearchResults(`
      <ol id="b_results">
        <li><h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9kb2Nz">Docs</a></h2></li>
        <li><h2><a href="https://example.com/blog">Blog</a></h2></li>
      </ol>
    `);

    expect(results).toEqual([
      {
        title: "Docs",
        url: "https://example.com/docs"
      },
      {
        title: "Blog",
        url: "https://example.com/blog"
      }
    ]);
  });

  it("parses Bing RSS results with snippets", () => {
    const results = parseBingSearchResults(`
      <?xml version="1.0" encoding="utf-8" ?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Example product changelog</title>
            <link>https://updates.example.test/changelog/</link>
            <description>Recent example product changes.</description>
          </item>
        </channel>
      </rss>
    `);

    expect(results).toEqual([
      {
        snippet: "Recent example product changes.",
        title: "Example product changelog",
        url: "https://updates.example.test/changelog/"
      }
    ]);
  });

  it("parses SearXNG JSON results", () => {
    expect(parseSearxngSearchResults(JSON.stringify({
      results: [
        { content: "Summary", score: 1, title: "One", url: "https://example.com/one" },
        { content: "Ignore me", title: "Bad", url: "javascript:alert(1)" }
      ]
    }), 5)).toEqual([
      {
        snippet: "Summary",
        title: "One",
        url: "https://example.com/one"
      }
    ]);
  });

  it("runs a Cherry-style local Bing search and fetches readable result pages", async () => {
    const transport = vi.fn<WebSearchTransport>(async (request) => {
      if (request.url.startsWith("https://www.bing.com/search")) {
        return {
          body: `<ol id="b_results"><li><h2><a href="https://example.com/page">Example page</a></h2></li></ol>`,
          finalUrl: request.url,
          status: 200
        };
      }

      return {
        body: "<article><h1>Example page</h1><p>Useful web content.</p></article>",
        finalUrl: request.url,
        status: 200
      };
    });

    const response = await runCherryStyleWebSearch("markra search", {
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    }, transport);

    expect(response).toEqual({
      query: "markra search",
      results: [
        {
          content: expect.stringContaining("Useful web content."),
          title: "Example page",
          url: "https://example.com/page"
        }
      ]
    });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      allowLocalhost: false,
      url: expect.stringContaining("https://www.bing.com/search?format=rss&q=markra%20search")
    }));
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      allowLocalhost: false,
      url: "https://example.com/page"
    }));
  });

  it("falls back to Bing RSS snippets when result pages cannot be fetched", async () => {
    const transport = vi.fn<WebSearchTransport>(async (request) => {
      if (request.url.startsWith("https://www.bing.com/search")) {
        return {
          body: `
            <rss version="2.0">
              <channel>
                <item>
                  <title>Example product changelog</title>
                  <link>https://updates.example.test/changelog/</link>
                  <description>Recent example product changes.</description>
                </item>
              </channel>
            </rss>
          `,
          finalUrl: request.url,
          status: 200
        };
      }

      return {
        body: "blocked",
        finalUrl: request.url,
        status: 403
      };
    });

    const response = await runCherryStyleWebSearch("example product updates", {
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    }, transport);

    expect(response).toEqual({
      query: "example product updates",
      results: [
        {
          content: "Recent example product changes.",
          snippet: "Recent example product changes.",
          title: "Example product changelog",
          url: "https://updates.example.test/changelog/"
        }
      ]
    });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      allowLocalhost: false,
      url: expect.stringContaining("format=rss")
    }));
  });

  it("uses SearXNG when configured and allows localhost only for the configured search endpoint", async () => {
    const transport = vi.fn<WebSearchTransport>(async (request) => {
      if (request.url.startsWith("http://localhost:8888/search")) {
        return {
          body: JSON.stringify({
            results: [{ title: "Local result", url: "https://example.com/local", content: "Snippet" }]
          }),
          finalUrl: request.url,
          status: 200
        };
      }

      return {
        body: "<article><h1>Local result</h1><p>Extracted body.</p></article>",
        finalUrl: request.url,
        status: 200
      };
    });

    await runCherryStyleWebSearch("local docs", {
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "searxng",
      searxngApiHost: "http://localhost:8888"
    }, transport);

    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      allowLocalhost: true,
      url: expect.stringContaining("http://localhost:8888/search?")
    }));
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      allowLocalhost: false,
      url: "https://example.com/local"
    }));
  });

  it("reports whether the configured web search provider is usable", () => {
    expect(webSearchSettingsAreUsable({
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "local-bing",
      searxngApiHost: ""
    })).toBe(true);
    expect(webSearchSettingsAreUsable({
      contentMaxChars: 12000,
      enabled: true,
      maxResults: 5,
      providerId: "searxng",
      searxngApiHost: ""
    })).toBe(false);
  });

  it("does not call Parallel when disabled or switch providers after an error", async () => {
    const settings = {
      contentMaxChars: 2000,
      enabled: true,
      maxResults: 5,
      providerId: "parallel" as const,
      searxngApiHost: "https://other.example.com"
    };
    const transport = vi.fn();
    const searchParallel = vi.fn().mockRejectedValue(new Error("Parallel search failed"));

    await expect(runCherryStyleWebSearch("notes", { ...settings, enabled: false }, transport, searchParallel))
      .rejects.toThrow("Web search is not configured.");
    expect(searchParallel).not.toHaveBeenCalled();

    await expect(runCherryStyleWebSearch("notes", settings, transport, searchParallel))
      .rejects.toThrow("Parallel search failed");
    expect(searchParallel).toHaveBeenCalledExactlyOnceWith("notes");
    expect(transport).not.toHaveBeenCalled();
  });
});
