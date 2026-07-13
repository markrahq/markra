import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

function matchCount(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function extractArrayArgument(source, callName) {
  const callMarker = `.${callName}(`;
  const callIndex = source.indexOf(callMarker);
  assert.notEqual(callIndex, -1, `${callName} call is missing`);

  const arrayStart = source.indexOf("[", callIndex + callMarker.length);
  assert.notEqual(arrayStart, -1, `${callName} array argument is missing`);

  let depth = 0;
  let escaped = false;
  let inString = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(arrayStart, index + 1);
    }
  }

  assert.fail(`${callName} array argument is not closed`);
}

const distUrl = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", distUrl), "utf8"));

assert.equal(manifest.name, "Markra");
assert.equal(manifest.short_name, "Markra");
assert.equal(manifest.description, "Local-first Markdown editor");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.deepEqual(manifest.icons, [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
]);

const expectedIcons = [
  ["icon-192.png", 192],
  ["icon-512.png", 512]
];

for (const [fileName, expectedSize] of expectedIcons) {
  const icon = await readFile(new URL(fileName, distUrl));
  assert.deepEqual(icon.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(icon.readUInt32BE(16), expectedSize, `${fileName} width`);
  assert.equal(icon.readUInt32BE(20), expectedSize, `${fileName} height`);
}

await stat(new URL("sw.js", distUrl));
const serviceWorker = await readFile(new URL("sw.js", distUrl), "utf8");
assert.match(serviceWorker, /index\.html/);
assert.doesNotMatch(serviceWorker, /api[_/-]|webdav|authorization/iu);
assert.doesNotMatch(serviceWorker, /CacheFirst|CacheOnly|NetworkFirst|NetworkOnly|StaleWhileRevalidate/);
assert.doesNotMatch(serviceWorker, /\.clientsClaim\(/);
assert.match(serviceWorker, /"SKIP_WAITING"===.*&&self\.skipWaiting\(\)/);

assert.equal(
  matchCount(serviceWorker, /(?<![\w$])precacheAndRoute\(/g),
  1,
  "Expected exactly one precacheAndRoute call"
);
const precacheArray = extractArrayArgument(serviceWorker, "precacheAndRoute");
const precacheUrlMatches = [...precacheArray.matchAll(/\{url:"((?:\\.|[^"\\])*)",revision:/g)];
assert.equal(
  precacheUrlMatches.length,
  matchCount(precacheArray, /\{url:/g),
  "Unable to extract every precache URL"
);

const precacheUrls = precacheUrlMatches.map(([, encodedUrl]) => JSON.parse(`"${encodedUrl}"`));
assert.ok(precacheUrls.length > 0, "Precache URL list is empty");
const precacheUrlSet = new Set(precacheUrls);
assert.equal(precacheUrlSet.size, precacheUrls.length, "Precache URLs must be unique");

const requiredShellUrls = new Set([
  "icon-192.png",
  "icon-512.png",
  "index.html",
  "manifest.webmanifest",
  "registerSW.js"
]);
for (const requiredUrl of requiredShellUrls) {
  assert.ok(precacheUrlSet.has(requiredUrl), `Required shell URL is missing from precache: ${requiredUrl}`);
}

const staticAssetPath = /^assets\/[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/;
const forbiddenPath =
  /(?:^|[/_.-])(?:api|auth|authorization|documents?|uploads?|user[-_]?data|user[-_]?(?:docs?|documents?|files?)|webdav)(?:$|[/_.-])/iu;

for (const url of precacheUrls) {
  assert.doesNotMatch(url, /^[a-z][a-z0-9+.-]*:/iu, `Precache URL must not use a scheme: ${url}`);
  assert.doesNotMatch(url, /\/\//u, `Precache URL must not contain //: ${url}`);
  assert.doesNotMatch(url, /[?#\\%]/u, `Precache URL must not contain query, hash, backslash, or encoding: ${url}`);
  assert.ok(
    !url.split("/").some((segment) => segment === "." || segment === ".."),
    `Precache URL must not traverse: ${url}`
  );
  assert.doesNotMatch(url, forbiddenPath, `Precache URL must not target sensitive or user-document paths: ${url}`);
  assert.ok(requiredShellUrls.has(url) || staticAssetPath.test(url), `Unexpected precache URL: ${url}`);
}

assert.equal(
  matchCount(serviceWorker, /(?<![\w$])cleanupOutdatedCaches\(\)/g),
  1,
  "Expected cleanupOutdatedCaches exactly once"
);
assert.equal(matchCount(serviceWorker, /(?<![\w$])registerRoute\(/g), 1, "Expected exactly one runtime route");
assert.match(
  serviceWorker,
  /([A-Za-z_$][\w$]*)\.registerRoute\(new \1\.NavigationRoute\(\1\.createHandlerBoundToURL\("index\.html"\)\)\)/
);
assert.doesNotMatch(serviceWorker, /addEventListener\(["']fetch["']/u, "Custom fetch event listeners are not allowed");
assert.doesNotMatch(
  serviceWorker,
  /(?<![\w$])(?:self\.)?onfetch\s*=/u,
  "Custom onfetch assignments are not allowed"
);
assert.doesNotMatch(
  serviceWorker,
  /\.(?:setCatchHandler|setDefaultHandler)\(/u,
  "Custom default or catch handlers are not allowed"
);

const importScriptsCalls = [...serviceWorker.matchAll(/(?<![\w$])importScripts\(([^()]*)\)/g)];
assert.equal(importScriptsCalls.length, 1, "Expected exactly one dynamic Workbox importScripts call");
assert.match(importScriptsCalls[0][1].trim(), /^[A-Za-z_$][\w$]*$/, "Workbox importScripts argument must be a variable");
const workboxModuleDefinitions = [
  ...serviceWorker.matchAll(/define\(\["\.\/workbox-[\w-]+"\],function\([A-Za-z_$][\w$]*\)\{/g)
];
assert.equal(
  workboxModuleDefinitions.length,
  1,
  "Expected exactly one Workbox-only module dependency"
);

const indexHtml = await readFile(new URL("index.html", distUrl), "utf8");
assert.match(indexHtml, /manifest\.webmanifest/);
assert.match(indexHtml, /registerSW\.js/);

const buildFiles = await readdir(distUrl);
assert.ok(buildFiles.some((fileName) => /^workbox-[\w-]+\.js$/.test(fileName)), "Workbox runtime is missing");

console.log(`PWA artifacts verified: ${precacheUrls.length} unique shell/static precache URLs and one navigation fallback`);
