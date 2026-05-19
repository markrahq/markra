import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { stripDebugPlugin } from "./scripts/vite/strip-debug";

const desktopPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version?: string };
const chunkSizeWarningLimitKb = 1200;
const fontAssetPattern = /\.(?:otf|ttf|woff2?)$/i;
const imageAssetPattern = /\.(?:avif|gif|ico|jpe?g|png|svg|webp)$/i;
const browserNodeStubPath = fileURLToPath(new URL("./src/lib/browser-node-stub.ts", import.meta.url));

function outputAssetFileName(asset: { names?: string[]; originalFileNames?: string[] }) {
  const sourceName = asset.names?.[0] ?? asset.originalFileNames?.[0] ?? "";

  if (imageAssetPattern.test(sourceName)) return "assets/images/[name]-[hash][extname]";
  if (fontAssetPattern.test(sourceName)) return "assets/fonts/[name]-[hash][extname]";

  return "assets/[name]-[hash][extname]";
}

function dependencyPattern(dependencies: string[]) {
  const dependencySource = dependencies.map((dependency) => dependency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

  return new RegExp(`node_modules[\\\\/](?:\\.pnpm[\\\\/][^\\\\/]+[\\\\/]node_modules[\\\\/])?(?:${dependencySource})(?:[\\\\/]|-)`);
}

const reactDependencies = dependencyPattern(["react", "react-dom"]);
const milkdownDependencies = dependencyPattern([
  "@milkdown",
  "prosemirror",
  "remark",
  "micromark",
  "unified",
  "mdast-util",
  "unist-util",
  "hast-util",
  "markdown-table",
  "orderedmap",
  "crelt",
  "rope-sequence",
  "w3c-keyname"
]);
const tauriDependencies = dependencyPattern(["@tauri-apps"]);
const iconDependencies = dependencyPattern(["lucide-react", "lucide-static"]);
const piAgentDependencies = dependencyPattern(["@mariozechner/pi-agent-core", "@mariozechner/pi-ai", "typebox"]);
const codeEditorDependencies = dependencyPattern(["@codemirror", "codemirror"]);
const dndDependencies = dependencyPattern(["@dnd-kit"]);
const mathDependencies = dependencyPattern(["katex"]);
const diagramDependencies = dependencyPattern([
  "@mermaid-js",
  "cytoscape",
  "d3",
  "dagre-d3-es",
  "dompurify",
  "elkjs",
  "khroma",
  "mermaid",
  "roughjs"
]);
const syntaxHighlightDependencies = dependencyPattern(["highlight.js", "lowlight"]);
const toastDependencies = dependencyPattern(["sonner"]);
const contentExtractionDependencies = dependencyPattern(["@mozilla/readability"]);
const aiSdkDependencies = dependencyPattern([
  "@anthropic-ai",
  "@aws-sdk",
  "@google",
  "@mistralai",
  "openai",
  "partial-json",
  "proxy-agent",
  "undici",
  "zod-to-json-schema"
]);

function vendorChunkName(id: string) {
  if (reactDependencies.test(id)) return "react-vendor";
  if (milkdownDependencies.test(id)) return "milkdown-vendor";
  if (tauriDependencies.test(id)) return "tauri-vendor";
  if (iconDependencies.test(id)) return "icons-vendor";
  if (piAgentDependencies.test(id)) return "pi-agent-vendor";
  if (codeEditorDependencies.test(id)) return "code-editor-vendor";
  if (dndDependencies.test(id)) return "dnd-vendor";
  if (mathDependencies.test(id)) return "math-vendor";
  if (diagramDependencies.test(id)) return "diagram-vendor";
  if (syntaxHighlightDependencies.test(id)) return "syntax-highlight-vendor";
  if (toastDependencies.test(id)) return "toast-vendor";
  if (contentExtractionDependencies.test(id)) return "content-extraction-vendor";
  if (aiSdkDependencies.test(id)) return "ai-sdk-vendor";
  if (id.includes("node_modules")) return "vendor";

  return null;
}

export default defineConfig(({ mode }) => ({
  define: {
    __MARKRA_APP_VERSION__: JSON.stringify(desktopPackage.version ?? "0.0.0"),
    __MARKRA_DEBUG__: JSON.stringify(mode !== "production")
  },
  resolve: mode === "test"
    ? undefined
    : {
        alias: [
          {
            find: /^node:(?:fs|os|path)$/,
            replacement: browserNodeStubPath
          }
        ]
      },
  plugins: [react(), tailwindcss(), ...(mode === "production" ? [stripDebugPlugin()] : [])],
  build: {
    chunkSizeWarningLimit: chunkSizeWarningLimitKb,
    assetsInlineLimit: (filePath) => {
      // Keep provider SVG logos as standalone assets instead of embedding them into JS chunks.
      if (filePath.toLowerCase().endsWith(".svg")) return false;

      return undefined;
    },
    rolldownOptions: {
      output: {
        assetFileNames: outputAssetFileName,
        codeSplitting: {
          groups: [
            {
              // Keep each dependency family intact; size-based splitting can break
              // circular CommonJS wrapper initialization across vendor chunks.
              name: vendorChunkName
            }
          ]
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
}));
