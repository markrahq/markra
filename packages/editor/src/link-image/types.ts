import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export type RawImageRange = {
  kind: "image";
  alt: string;
  src: string;
  title: string;
  from: number;
  to: number;
};

export type RawLinkRange = {
  kind: "link";
  label: string;
  href: string;
  title: string | null;
  from: number;
  to: number;
  labelFrom: number;
  labelTo: number;
};

export type RawMarkdownRange = RawImageRange | RawLinkRange;

export type AbsoluteRawMarkdownRange = RawMarkdownRange & {
  from: number;
  to: number;
};

export type LiveMarkdownReplacement = {
  from: number;
  node: ProseNode;
  to: number;
};

export type ResolveMarkdownImageSrc = (src: string) => string | Promise<string>;
