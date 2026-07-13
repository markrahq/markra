import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";

const distUrl = new URL("../dist/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", distUrl), "utf8"));

assert.equal(manifest.name, "Markra");
assert.equal(manifest.short_name, "Markra");
assert.equal(manifest.description, "Local-first Markdown editor");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.start_url, "/");
assert.equal(manifest.scope, "/");
assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512", "512x512"]);
assert.deepEqual(manifest.icons.map(({ src }) => src), ["/icon-192.png", "/icon-512.png", "/icon-512.png"]);

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
assert.doesNotMatch(serviceWorker, /CacheFirst|NetworkFirst|NetworkOnly|StaleWhileRevalidate/);
assert.doesNotMatch(serviceWorker, /\.clientsClaim\(/);
assert.match(serviceWorker, /"SKIP_WAITING"===.*&&self\.skipWaiting\(\)/);

const indexHtml = await readFile(new URL("index.html", distUrl), "utf8");
assert.match(indexHtml, /manifest\.webmanifest/);
assert.match(indexHtml, /registerSW\.js/);

const buildFiles = await readdir(distUrl);
assert.ok(buildFiles.some((fileName) => /^workbox-[\w-]+\.js$/.test(fileName)), "Workbox runtime is missing");

console.log("PWA artifacts verified: manifest, app shell, icons, service worker, and Workbox runtime");
