import type { AgentTool } from "@mariozechner/pi-agent-core";
import { BatchEditToolFactory } from "./batch-edit";
import { DeleteContentToolFactory } from "./delete-content";
import { GetEditorContextToolFactory } from "./get-editor-context";
import { InspectDocumentStructureToolFactory } from "./inspect-document-structure";
import { InsertContentToolFactory } from "./insert-content";
import { ListAssetsToolFactory } from "./list-assets";
import { LocateContentToolFactory } from "./locate-content";
import { MoveContentToolFactory } from "./move-content";
import { ReadDocumentToolFactory } from "./read-document";
import { ReadWorkspaceFileToolFactory } from "./read-workspace-file";
import { ReplaceContentToolFactory } from "./replace-content";
import { SearchDocumentToolFactory } from "./search-document";
import { SearchWorkspaceToolFactory } from "./search-workspace";
import { ValidateEditToolFactory } from "./validate-edit";
import type { DocumentAgentToolContext, DocumentAgentToolState } from "./context";
import { ViewAssetToolFactory } from "./view-asset";
import { WebSearchToolFactory } from "./web-search-tool";

export function createDocumentAgentTools(context: DocumentAgentToolContext): AgentTool[] {
  const state: DocumentAgentToolState = {
    preparedInsertions: []
  };
  const tools = [
    ...(context.webSearch ? [new WebSearchToolFactory(context, state)] : []),
    new GetEditorContextToolFactory(context, state),
    new ReadDocumentToolFactory(context, state),
    new InspectDocumentStructureToolFactory(context, state),
    new SearchDocumentToolFactory(context, state),
    new LocateContentToolFactory(context, state),
    new ReplaceContentToolFactory(context, state),
    new InsertContentToolFactory(context, state),
    new DeleteContentToolFactory(context, state),
    new MoveContentToolFactory(context, state),
    new BatchEditToolFactory(context, state),
    new SearchWorkspaceToolFactory(context, state),
    new ReadWorkspaceFileToolFactory(context, state),
    new ListAssetsToolFactory(context, state),
    new ViewAssetToolFactory(context, state),
    new ValidateEditToolFactory(context, state)
  ];

  return tools.map((tool) => tool.create());
}
