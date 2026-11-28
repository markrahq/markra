import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export type WebResourceRequest = {
  allowLocalhost?: boolean;
  headers?: Record<string, string>;
  url: string;
};

export type WebResourceResponse = {
  body: string;
  contentType?: string | null;
  finalUrl: string;
  status: number;
};

export type WebSearchProviderId = "local-bing" | "searxng" | "parallel";

export type WebSearchSettings = {
  contentMaxChars: number;
  enabled: boolean;
  maxResults: number;
  providerId: WebSearchProviderId;
  searxngApiHost: string;
};

export type WebSearchResult = {
  content: string;
  snippet?: string;
  title: string;
  url: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

export type WebSearchTransport = (request: WebResourceRequest) => Promise<WebResourceResponse>;

export type ParallelSearchTransport = (query: string) => Promise<Array<{
  excerpts: string[] | null;
  title: string | null;
  url: string;
}>>;

type SearchHit = {
  snippet?: string;
  title: string;
  url: string;
};

const defaultHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};
const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  headingStyle: "atx"
});

export function webSearchSettingsAreUsable(settings: WebSearchSettings | null | undefined) {
  if (!settings?.enabled) return false;
  if (settings.providerId === "local-bing" || settings.providerId === "parallel") return true;
  if (settings.providerId === "searxng") return settings.searxngApiHost.trim().length > 0;

  return false;
}

export async function runCherryStyleWebSearch(
  query: string,
  settings: WebSearchSettings,
  transport: WebSearchTransport = missingWebSearchTransport,
  searchParallel?: ParallelSearchTransport
): Promise<WebSearchResponse> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new Error("Search query cannot be empty.");
  }
  if (!webSearchSettingsAreUsable(settings)) {
    throw new Error("Web search is not configured.");
  }
  if (settings.providerId === "parallel") {
    if (!searchParallel) throw new Error("Parallel web search requires the desktop app.");

    const hits = await searchParallel(normalizedQuery);
    const results = hits.flatMap((hit) => {
      const url = hit.url.trim();
      const passage = hit.excerpts?.map((excerpt) => excerpt.trim()).filter(Boolean).join("\n\n") ?? "";
      if (!passage || !isHttpUrl(url)) return [];

      return [{
        content: truncateText(passage, settings.contentMaxChars),
        title: sanitizeWhitespace(hit.title ?? "") || url,
        url
      }];
    });

    return { query: normalizedQuery, results: dedupeSearchHits(results).slice(0, settings.maxResults) };
  }

  const hits =
    settings.providerId === "searxng"
      ? await searchWithSearxng(normalizedQuery, settings, transport)
      : await searchWithBing(normalizedQuery, settings, transport);
  const selectedHits = dedupeSearchHits(hits).slice(0, settings.maxResults);
  const settledResults = await Promise.allSettled(
    selectedHits.map((hit) => fetchSearchHitContent(hit, settings, transport))
  );
  const results = settledResults
    .map((result, index): WebSearchResult | null => {
      if (result.status === "fulfilled") return result.value;

      const hit = selectedHits[index];
      if (!hit?.snippet) return null;

      return {
        content: hit.snippet,
        snippet: hit.snippet,
        title: hit.title,
        url: hit.url
      };
    })
    .filter((result): result is WebSearchResult => result !== null && result.content.trim().length > 0);

  return {
    query: normalizedQuery,
    results
  };
}

export function extractReadableWebContent(html: string, url: string, maxChars: number) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  removeNoisyNodes(document);

  const article = new Readability(document, {
    keepClasses: false
  }).parse();
  const headingTitle = sanitizeWhitespace(document.querySelector("article h1, main h1, h1")?.textContent ?? "");
  const title = sanitizeWhitespace(headingTitle || article?.title || document.title || url);
  const contentHtml = article?.content || document.body?.innerHTML || "";
  const markdown = normalizeMarkdown(turndownService.turndown(contentHtml));
  const content = truncateText(markdown || article?.textContent || "", maxChars);

  return {
    content,
    title: title || url,
    url
  };
}

export function parseBingSearchResults(html: string): SearchHit[] {
  const parser = new DOMParser();
  const xmlDocument = parser.parseFromString(html.trim(), "application/xml");
  const rssHits = parseBingRssSearchResults(xmlDocument);
  if (rssHits.length > 0) return rssHits;

  const document = parser.parseFromString(html, "text/html");
  const anchors = Array.from(document.querySelectorAll("#b_results h2 a"));

  return anchors
    .map((anchor) => ({
      title: sanitizeWhitespace(anchor.textContent ?? ""),
      url: decodeBingRedirectUrl((anchor as HTMLAnchorElement).href)
    }))
    .filter((item) => item.title.length > 0 && isHttpUrl(item.url));
}

function parseBingRssSearchResults(document: Document): SearchHit[] {
  return Array.from(document.querySelectorAll("item"))
    .map((item) => ({
      snippet: sanitizeSnippet(item.querySelector("description")?.textContent ?? ""),
      title: sanitizeWhitespace(item.querySelector("title")?.textContent ?? ""),
      url: item.querySelector("link")?.textContent?.trim() ?? ""
    }))
    .filter((item) => item.title.length > 0 && isHttpUrl(item.url));
}

export function parseSearxngSearchResults(body: string, limit: number): SearchHit[] {
  const parsed = JSON.parse(body) as {
    results?: Array<{
      content?: unknown;
      score?: unknown;
      title?: unknown;
      url?: unknown;
    }>;
  };
  const results = Array.isArray(parsed.results) ? parsed.results : [];

  return results
    .map((item) => ({
      score: typeof item.score === "number" ? item.score : 0,
      snippet: typeof item.content === "string" ? sanitizeWhitespace(item.content) : undefined,
      title: typeof item.title === "string" ? sanitizeWhitespace(item.title) : "",
      url: typeof item.url === "string" ? item.url : ""
    }))
    .filter((item) => item.title.length > 0 && isHttpUrl(item.url))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item);
}

export function formatWebSearchToolResult(response: WebSearchResponse) {
  if (!response.results.length) {
    return `Search query: ${response.query}\n\nNo readable web results were found.`;
  }

  return [
    `Search query: ${response.query}`,
    "",
    "Use these web sources for the answer. Cite sources with [1], [2], etc.",
    "",
    ...response.results.flatMap((result, index) => [
      `[${index + 1}] ${result.title}`,
      `URL: ${result.url}`,
      "",
      result.content,
      ""
    ])
  ].join("\n").trim();
}

async function searchWithBing(query: string, settings: WebSearchSettings, transport: WebSearchTransport) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}&ensearch=1`;
  const response = await transport({
    allowLocalhost: false,
    headers: {
      ...defaultHeaders,
      accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.7"
    },
    url
  });
  ensureSuccessfulResponse(response, "Bing search");

  return parseBingSearchResults(response.body).slice(0, settings.maxResults);
}

async function searchWithSearxng(query: string, settings: WebSearchSettings, transport: WebSearchTransport) {
  const baseUrl = settings.searxngApiHost.replace(/\/+$/u, "");
  const url = new URL(`${baseUrl}/search`);

  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("pageno", "1");

  const response = await transport({
    allowLocalhost: true,
    headers: {
      accept: "application/json"
    },
    url: url.toString()
  });
  ensureSuccessfulResponse(response, "SearXNG search");

  return parseSearxngSearchResults(response.body, settings.maxResults);
}

async function fetchSearchHitContent(
  hit: SearchHit,
  settings: WebSearchSettings,
  transport: WebSearchTransport
): Promise<WebSearchResult> {
  const response = await transport({
    allowLocalhost: false,
    headers: defaultHeaders,
    url: hit.url
  });
  ensureSuccessfulResponse(response, "Web content fetch");

  const extracted = extractReadableWebContent(response.body, response.finalUrl || hit.url, settings.contentMaxChars);

  return {
    content: extracted.content || hit.snippet || "",
    ...(hit.snippet ? { snippet: hit.snippet } : {}),
    title: extracted.title || hit.title,
    url: extracted.url || hit.url
  };
}

function ensureSuccessfulResponse(response: WebResourceResponse, label: string) {
  if (response.status >= 200 && response.status < 300) return;

  throw new Error(`${label} failed with HTTP ${response.status}.`);
}

function missingWebSearchTransport(): never {
  throw new Error("Web search transport is not configured.");
}

function dedupeSearchHits<Hit extends SearchHit>(hits: Hit[]) {
  const seenUrls = new Set<string>();

  return hits.filter((hit) => {
    const key = hit.url.trim();
    if (!key || seenUrls.has(key)) return false;

    seenUrls.add(key);
    return true;
  });
}

function removeNoisyNodes(document: Document) {
  document.querySelectorAll("script, style, noscript, svg, nav, footer, aside, form").forEach((node) => {
    node.remove();
  });
}

function decodeBingRedirectUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const encodedUrl = url.searchParams.get("u");
    if (!encodedUrl?.startsWith("a1")) return rawUrl;

    const decodedUrl = atob(encodedUrl.slice(2));
    return isHttpUrl(decodedUrl) ? decodedUrl : rawUrl;
  } catch {
    return rawUrl;
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMarkdown(value: string) {
  return value
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function sanitizeWhitespace(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function sanitizeSnippet(value: string) {
  const normalized = value.trim();
  if (!normalized.includes("<")) return sanitizeWhitespace(normalized);

  const parser = new DOMParser();
  const document = parser.parseFromString(normalized, "text/html");

  return sanitizeWhitespace(document.body?.textContent ?? normalized);
}

function truncateText(value: string, maxChars: number) {
  const limit = Math.max(1000, maxChars);
  if (value.length <= limit) return value;

  return `${value.slice(0, limit).trim()}\n\n[Content truncated]`;
}
