import type {
  ReadAiChatAttachmentInput,
  SaveAiChatAttachmentInput
} from "@markra/app/runtime";
import { invokeNative } from "./invoke";

export function saveNativeAiChatAttachment(input: SaveAiChatAttachmentInput) {
  return invokeNative("save_ai_chat_attachment", input);
}

export function readNativeAiChatAttachment(input: ReadAiChatAttachmentInput) {
  return invokeNative<number[]>("read_ai_chat_attachment", input);
}

export function deleteNativeAiChatAttachmentSession(sessionId: string) {
  return invokeNative("delete_ai_chat_attachment_session", { sessionId });
}
