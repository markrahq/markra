export function existsSync() {
  return false;
}

export function readFileSync() {
  throw new Error("node:fs is unavailable in the browser build.");
}

export function homedir() {
  return "";
}

export function join(...parts: string[]) {
  return parts.filter(Boolean).join("/").replace(/\/+/gu, "/");
}
