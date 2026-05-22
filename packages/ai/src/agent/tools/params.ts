import type { DocumentAnchorPlacement, RegionOperation } from "./context";

export type BatchEditOperationKind = "delete" | "insert" | "replace";
export type ContentTargetKind = "block" | "document" | "region" | "section" | "table";
export type LocateContentTargetKind = "region" | "section";
export type ReadDocumentTargetKind = "anchor" | "document" | "range" | "section";
export type SearchDocumentMode = "heading" | "regex" | "table" | "text";

export type BatchEditOperation = {
  anchorId?: string;
  content?: string;
  exactText?: string;
  from?: number;
  placement?: "after" | "before";
  replacement?: string;
  to?: number;
  type: BatchEditOperationKind;
};

export type BatchEditArgs = {
  operations: BatchEditOperation[];
};

export type DeleteContentArgs = {
  anchorId?: string;
  targetKind?: Extract<ContentTargetKind, "region" | "section">;
};

export type InsertContentArgs = {
  anchorId?: string;
  content: string;
  placement: DocumentAnchorPlacement;
};

export type LocateContentArgs = {
  goal?: string;
  headingTitle?: string;
  operation: RegionOperation;
  targetKind: LocateContentTargetKind;
};

export type MoveContentArgs = {
  destinationAnchorId?: string;
  destinationText?: string;
  placement: "after" | "before";
  sourceAnchorId?: string;
  sourceText?: string;
};

export type ReadDocumentArgs = {
  anchorId?: string;
  from?: number;
  maxChars?: number;
  offset?: number;
  targetKind: ReadDocumentTargetKind;
  to?: number;
};

export type ReadWorkspaceFileArgs = {
  path?: string;
  relativePath?: string;
};

export type ReplaceContentArgs = {
  anchorId?: string;
  headingTitle?: string;
  originalText?: string;
  replacement: string;
  targetKind?: ContentTargetKind;
};

export type SearchDocumentArgs = {
  caseSensitive?: boolean;
  maxResults?: number;
  mode: SearchDocumentMode;
  query: string;
};

export type SearchWorkspaceArgs = {
  maxResults?: number;
  query: string;
};

export type ValidateEditArgs = {
  content?: string;
};

export type ViewAssetArgs = {
  src: string;
};

export type WebSearchArgs = {
  query: string;
};

export function typedBatchEditArgs(params: unknown): BatchEditArgs {
  const args = params as { operations?: BatchEditOperation[] };

  return {
    operations: Array.isArray(args.operations)
      ? args.operations.map((operation) => typedBatchEditOperation(operation))
      : []
  };
}

export function typedDeleteContentArgs(params: unknown): DeleteContentArgs {
  const args = params as DeleteContentArgs;

  return {
    anchorId: args.anchorId?.trim() || undefined,
    targetKind: args.targetKind === "section" ? "section" : args.targetKind === "region" ? "region" : undefined
  };
}

export function typedInsertContentArgs(params: unknown): InsertContentArgs {
  const args = params as { anchorId?: string; content: string; placement?: string };
  const placement = [
    "after_anchor",
    "after_selection",
    "after_heading",
    "before_anchor",
    "before_selection",
    "before_heading",
    "cursor"
  ].includes(args.placement ?? "")
    ? (args.placement as DocumentAnchorPlacement)
    : "cursor";

  return {
    anchorId: args.anchorId?.trim() || undefined,
    content: args.content,
    placement
  };
}

export function typedLocateContentArgs(params: unknown): LocateContentArgs {
  const args = params as { goal?: string; headingTitle?: string; operation?: string; targetKind?: string };
  const operation = ["delete", "insert", "replace"].includes(args.operation ?? "")
    ? (args.operation as RegionOperation)
    : "insert";

  return {
    goal: args.goal?.trim() || undefined,
    headingTitle: args.headingTitle?.trim() || undefined,
    operation,
    targetKind: args.targetKind === "section" ? "section" : "region"
  };
}

export function typedMoveContentArgs(params: unknown): MoveContentArgs {
  const args = params as MoveContentArgs;

  return {
    destinationAnchorId: args.destinationAnchorId?.trim() || undefined,
    destinationText: args.destinationText || undefined,
    placement: args.placement === "after" ? "after" : "before",
    sourceAnchorId: args.sourceAnchorId?.trim() || undefined,
    sourceText: args.sourceText || undefined
  };
}

export function typedReadDocumentArgs(params: unknown): ReadDocumentArgs {
  const args = params as ReadDocumentArgs;

  return {
    anchorId: args.anchorId?.trim() || undefined,
    from: typeof args.from === "number" ? args.from : undefined,
    maxChars: typeof args.maxChars === "number" ? args.maxChars : undefined,
    offset: typeof args.offset === "number" ? args.offset : undefined,
    targetKind: typedReadDocumentTargetKind(args.targetKind),
    to: typeof args.to === "number" ? args.to : undefined
  };
}

export function typedReadWorkspaceFileArgs(params: unknown): ReadWorkspaceFileArgs {
  const args = params as ReadWorkspaceFileArgs;

  return {
    path: args.path?.trim() || undefined,
    relativePath: args.relativePath?.trim() || undefined
  };
}

export function typedReplaceContentArgs(params: unknown): ReplaceContentArgs {
  const args = params as ReplaceContentArgs;

  return {
    anchorId: args.anchorId?.trim() || undefined,
    headingTitle: args.headingTitle?.trim() || undefined,
    originalText: typeof args.originalText === "string" && args.originalText.length > 0 ? args.originalText : undefined,
    replacement: args.replacement,
    targetKind: typedContentTargetKind(args.targetKind)
  };
}

export function typedSearchDocumentArgs(params: unknown): SearchDocumentArgs {
  const args = params as SearchDocumentArgs;

  return {
    caseSensitive: Boolean(args.caseSensitive),
    maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
    mode: typedSearchDocumentMode(args.mode),
    query: args.query.trim()
  };
}

export function typedSearchWorkspaceArgs(params: unknown): SearchWorkspaceArgs {
  const args = params as SearchWorkspaceArgs;

  return {
    maxResults: typeof args.maxResults === "number" ? args.maxResults : undefined,
    query: args.query.trim()
  };
}

export function typedValidateEditArgs(params: unknown): ValidateEditArgs {
  const args = params as ValidateEditArgs;

  return {
    content: args.content
  };
}

export function typedViewAssetArgs(params: unknown): ViewAssetArgs {
  const args = params as ViewAssetArgs;

  return {
    src: args.src.trim()
  };
}

export function typedWebSearchArgs(params: unknown): WebSearchArgs {
  const args = params as WebSearchArgs;

  return {
    query: args.query.trim()
  };
}

function typedBatchEditOperation(operation: BatchEditOperation): BatchEditOperation {
  return {
    anchorId: operation.anchorId?.trim() || undefined,
    content: operation.content,
    exactText: operation.exactText,
    from: typeof operation.from === "number" ? operation.from : undefined,
    placement: operation.placement === "after" ? "after" : "before",
    replacement: operation.replacement,
    to: typeof operation.to === "number" ? operation.to : undefined,
    type: typedBatchEditOperationKind(operation.type)
  };
}

function typedBatchEditOperationKind(value: unknown): BatchEditOperationKind {
  if (value === "insert" || value === "delete" || value === "replace") return value;

  return "replace";
}

function typedContentTargetKind(value: unknown): ContentTargetKind | undefined {
  return ["block", "document", "region", "section", "table"].includes(String(value))
    ? value as ContentTargetKind
    : undefined;
}

function typedReadDocumentTargetKind(value: unknown): ReadDocumentTargetKind {
  return ["anchor", "document", "range", "section"].includes(String(value))
    ? value as ReadDocumentTargetKind
    : "document";
}

function typedSearchDocumentMode(value: unknown): SearchDocumentMode {
  return ["heading", "regex", "table", "text"].includes(String(value))
    ? value as SearchDocumentMode
    : "text";
}
