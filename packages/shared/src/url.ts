export function joinApiUrl(baseUrl: string, path: string) {
  if (/^https?:\/\/[^/]+\/?$/.test(baseUrl) && path.startsWith("?")) return `${baseUrl.replace(/\/$/, "")}${path}`;
  if (baseUrl.includes("?")) return baseUrl;

  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function normalizedExternalAutolinkUrl(text: string) {
  const trimmed = text.trim();
  if (!trimmed || /\s/u.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}
