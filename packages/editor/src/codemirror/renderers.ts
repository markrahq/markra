import {
  Facet,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
import type { Decoration, EditorView } from "@codemirror/view";
import type { RevealScope } from "./policy.ts";

export interface MarkraSyntaxNode {
  readonly from: number;
  readonly name: string;
  readonly parent: MarkraSyntaxNode | null;
  readonly to: number;
  getChild(name: string): MarkraSyntaxNode | null;
  getChildren(name: string): readonly MarkraSyntaxNode[];
}

export function markraListDepth(node: MarkraSyntaxNode) {
  let depth = 0;
  let parent = node.parent;
  while (parent) {
    if (parent.name === "ListItem") depth += 1;
    parent = parent.parent;
  }
  return depth;
}

export interface MarkraRendererContext {
  readonly node: MarkraSyntaxNode;
  readonly state: EditorState;
  readonly view: EditorView;
  readonly visibleRange: Readonly<{ from: number; to: number }>;
  add(range: Range<Decoration>): unknown;
  revealed(scope?: RevealScope): boolean;
}

export interface MarkraRenderer {
  readonly id: string;
  readonly nodeNames: readonly string[];
  readonly scope?: MarkraRendererScope;
  render(context: MarkraRendererContext): unknown;
}

export type MarkraRendererScope = "node" | "visible-range";

interface RendererRegistry {
  byNodeName: ReadonlyMap<string, readonly MarkraRenderer[]>;
}

function createRendererRegistry(
  renderers: readonly MarkraRenderer[],
): RendererRegistry {
  const ids = new Set<string>();
  const byNodeName = new Map<string, MarkraRenderer[]>();

  for (const renderer of renderers) {
    if (ids.has(renderer.id)) {
      throw new Error(`Duplicate Markra renderer id "${renderer.id}"`);
    }
    ids.add(renderer.id);

    for (const nodeName of renderer.nodeNames) {
      const registered = byNodeName.get(nodeName) ?? [];
      registered.push(renderer);
      byNodeName.set(nodeName, registered);
    }
  }

  return { byNodeName };
}

const rendererFacet = Facet.define<MarkraRenderer, RendererRegistry>({
  combine: createRendererRegistry,
});

export function markraRenderer(renderer: MarkraRenderer): Extension {
  if (!renderer.id.trim()) {
    throw new Error("Markra renderer id must not be empty");
  }
  if (renderer.nodeNames.length === 0) {
    throw new Error(`Markra renderer "${renderer.id}" must declare a node name`);
  }
  return rendererFacet.of(renderer);
}

export function getMarkraRenderers(state: EditorState, nodeName: string) {
  return state.facet(rendererFacet).byNodeName.get(nodeName) ?? [];
}
