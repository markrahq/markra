import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type SelectionRange,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
  type EditorView as CodeMirrorView,
} from "@codemirror/view";
import {
  markdownImageDragSrcForDocument,
  readMarkdownImageDragPayload,
} from "@markra/shared";
import type {
  RemoteClipboardImage,
  SaveClipboardAttachment,
  SaveClipboardImage,
  SavedClipboardAttachment,
  SavedClipboardImage,
  SaveRemoteClipboardImage,
} from "../clipboard-asset-types.ts";
import { looksLikeMarkdownSource } from "../markdown-source-detection.ts";
import {
  handlePendingPlainTextPasteEvent,
  isPlainTextPaste,
} from "../plain-text-paste.ts";
import {
  codeMirrorSelectionIsInsideFencedCode,
  serializeCodeMirrorMarkdownImage,
  serializeCodeMirrorMarkdownLink,
} from "./controller.ts";
import { detectCodePaste, type DetectedCodePaste } from "./code-paste.ts";
import { convertCodeMirrorClipboardHtml } from "./html-paste.ts";
import { defineMarkraPlugin } from "./plugin.ts";

export interface CodeMirrorClipboardAssetsPluginOptions {
  documentPath?: () => string | null | undefined;
  saveAttachment?: SaveClipboardAttachment;
  saveImage?: SaveClipboardImage;
  saveRemoteImage?: SaveRemoteClipboardImage;
  uploadLabel?: string;
}

type PlaceholderReplaceMode = "dynamic" | "range";

interface ClipboardPlaceholder {
  readonly from: number;
  readonly id: string;
  readonly position: number;
  readonly replaceMode: PlaceholderReplaceMode;
  readonly to: number;
}

interface RemoteImageReplacement {
  readonly from: number;
  readonly id: string;
  readonly image: RemoteClipboardImage;
  readonly to: number;
}

interface ClipboardAssetsState {
  readonly decorations: DecorationSet;
  readonly placeholders: readonly ClipboardPlaceholder[];
  readonly remoteImages: readonly RemoteImageReplacement[];
}

let nextClipboardAssetSequence = 0;

function nextClipboardAssetId(prefix: string) {
  nextClipboardAssetSequence += 1;
  return `markra-${prefix}-${nextClipboardAssetSequence}`;
}

class UploadPlaceholderWidget extends WidgetType {
  constructor(
    readonly id: string,
    readonly label: string,
  ) {
    super();
  }

  eq(other: UploadPlaceholderWidget) {
    return this.id === other.id && this.label === other.label;
  }

  toDOM(view: CodeMirrorView) {
    const document = view.dom.ownerDocument;
    const placeholder = document.createElement("span");
    const spinner = document.createElement("span");
    const label = document.createElement("span");
    placeholder.className = "markra-image-upload-placeholder";
    placeholder.dataset.markraImageUploadPlaceholder = this.id;
    placeholder.setAttribute("aria-live", "polite");
    placeholder.setAttribute("role", "status");
    spinner.className = "markra-image-upload-placeholder-spinner";
    spinner.setAttribute("aria-hidden", "true");
    label.className = "markra-image-upload-placeholder-label";
    label.textContent = this.label;
    placeholder.append(spinner, label);
    return placeholder;
  }
}

const addPlaceholdersEffect = StateEffect.define<readonly ClipboardPlaceholder[]>();
const removePlaceholdersEffect = StateEffect.define<ReadonlySet<string>>();
const addRemoteImagesEffect = StateEffect.define<readonly RemoteImageReplacement[]>();
const removeRemoteImagesEffect = StateEffect.define<ReadonlySet<string>>();

function mapPlaceholder(
  placeholder: ClipboardPlaceholder,
  transaction: Transaction,
) {
  if (transaction.changes.empty) return placeholder;
  const from = transaction.changes.mapPos(placeholder.from, 1);
  const to = transaction.changes.mapPos(placeholder.to, -1);
  if (placeholder.replaceMode === "range" && from > to) return null;
  return {
    ...placeholder,
    from,
    position: transaction.changes.mapPos(placeholder.position, 1),
    to,
  };
}

function mapRemoteImage(
  remote: RemoteImageReplacement,
  transaction: Transaction,
) {
  if (transaction.changes.empty) return remote;
  const from = transaction.changes.mapPos(remote.from, 1);
  const to = transaction.changes.mapPos(remote.to, -1);
  return from <= to ? { ...remote, from, to } : null;
}

function buildPlaceholderDecorations(
  placeholders: readonly ClipboardPlaceholder[],
  label: string,
) {
  return Decoration.set(
    placeholders.map((placeholder) =>
      Decoration.widget({
        side: -1,
        widget: new UploadPlaceholderWidget(placeholder.id, label),
      }).range(placeholder.position),
    ),
    true,
  );
}

function clipboardAssetsStateField(uploadLabel: string) {
  return StateField.define<ClipboardAssetsState>({
    create() {
      return {
        decorations: Decoration.none,
        placeholders: [],
        remoteImages: [],
      };
    },
    update(previous, transaction) {
      let placeholders = previous.placeholders.flatMap((placeholder) => {
        const mapped = mapPlaceholder(placeholder, transaction);
        return mapped ? [mapped] : [];
      });
      let remoteImages = previous.remoteImages.flatMap((remote) => {
        const mapped = mapRemoteImage(remote, transaction);
        return mapped ? [mapped] : [];
      });

      for (const effect of transaction.effects) {
        if (effect.is(addPlaceholdersEffect)) {
          placeholders = [...placeholders, ...effect.value];
        } else if (effect.is(removePlaceholdersEffect)) {
          placeholders = placeholders.filter(
            (placeholder) => !effect.value.has(placeholder.id),
          );
        } else if (effect.is(addRemoteImagesEffect)) {
          remoteImages = [...remoteImages, ...effect.value];
        } else if (effect.is(removeRemoteImagesEffect)) {
          remoteImages = remoteImages.filter(
            (remote) => !effect.value.has(remote.id),
          );
        }
      }

      return {
        decorations: buildPlaceholderDecorations(placeholders, uploadLabel),
        placeholders,
        remoteImages,
      };
    },
    provide: (field) => EditorView.decorations.from(
      field,
      (value) => value.decorations,
    ),
  });
}

function transferFiles(dataTransfer: DataTransfer | null | undefined) {
  const files = dataTransfer?.files as (ArrayLike<File> & {
    item?: (index: number) => File | null;
  }) | undefined;
  if (!files?.length) return [];
  const result: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = typeof files.item === "function" ? files.item(index) : files[index];
    if (file) result.push(file);
  }
  return result;
}

function imageFiles(dataTransfer: DataTransfer | null | undefined) {
  return transferFiles(dataTransfer).filter((file) => file.type.startsWith("image/"));
}

function attachmentFiles(dataTransfer: DataTransfer | null | undefined) {
  return transferFiles(dataTransfer).filter((file) => !file.type.startsWith("image/"));
}

function structuredTableClipboard(event: ClipboardEvent) {
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (/<table[\s>]/iu.test(html)) return true;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  return text.trim().split(/\r\n?|\n/u).some((row) => row.includes("\t"));
}

function currentPlaceholder(
  view: CodeMirrorView,
  field: StateField<ClipboardAssetsState>,
  id: string,
) {
  return view.state.field(field).placeholders.find(
    (placeholder) => placeholder.id === id,
  ) ?? null;
}

function removePlaceholders(view: CodeMirrorView, ids: readonly string[]) {
  if (ids.length === 0) return;
  view.dispatch({ effects: removePlaceholdersEffect.of(new Set(ids)) });
}

function replacementRange(placeholder: ClipboardPlaceholder) {
  return placeholder.replaceMode === "range"
    ? { from: placeholder.from, to: placeholder.to }
    : { from: placeholder.position, to: placeholder.position };
}

function replacePlaceholder(
  view: CodeMirrorView,
  field: StateField<ClipboardAssetsState>,
  id: string,
  image: SavedClipboardImage,
) {
  const placeholder = currentPlaceholder(view, field, id);
  if (!placeholder || view.state.readOnly) {
    removePlaceholders(view, [id]);
    return false;
  }
  const range = replacementRange(placeholder);
  const markdown = serializeCodeMirrorMarkdownImage(image);
  view.dispatch({
    changes: { ...range, insert: markdown },
    effects: removePlaceholdersEffect.of(new Set([id])),
    scrollIntoView: true,
    selection: EditorSelection.cursor(range.from + markdown.length),
  });
  view.focus();
  return true;
}

function addUploadPlaceholders(
  view: CodeMirrorView,
  count: number,
  selection: SelectionRange,
) {
  const placeholders = Array.from({ length: count }, (_, index) => ({
    from: selection.from,
    id: nextClipboardAssetId("image-upload"),
    position: selection.from,
    replaceMode: !selection.empty && index === 0 ? "range" : "dynamic",
    to: selection.to,
  } satisfies ClipboardPlaceholder));
  view.dispatch({ effects: addPlaceholdersEffect.of(placeholders) });
  return placeholders;
}

async function saveAndInsertImages(
  view: CodeMirrorView,
  field: StateField<ClipboardAssetsState>,
  files: readonly File[],
  saveImage: SaveClipboardImage,
  selection: SelectionRange,
) {
  const placeholders = addUploadPlaceholders(view, files.length, selection);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const placeholder = placeholders[index];
    if (!file || !placeholder) continue;
    let saved: SavedClipboardImage | null;
    try {
      saved = await saveImage(file);
    } catch (error) {
      removePlaceholders(
        view,
        placeholders.slice(index).map((candidate) => candidate.id),
      );
      console.error("[markra-codemirror-clipboard] failed to save image", error);
      return;
    }
    if (saved) {
      replacePlaceholder(view, field, placeholder.id, saved);
    } else {
      removePlaceholders(view, [placeholder.id]);
    }
  }
}

async function saveAndInsertAttachments(
  view: CodeMirrorView,
  files: readonly File[],
  saveAttachment: SaveClipboardAttachment,
  selection: SelectionRange,
) {
  const saved: SavedClipboardAttachment[] = [];
  for (const file of files) {
    try {
      const attachment = await saveAttachment(file);
      if (attachment) saved.push(attachment);
    } catch (error) {
      console.error("[markra-codemirror-clipboard] failed to save attachment", error);
      return;
    }
  }
  if (saved.length === 0 || view.state.readOnly) return;
  const markdown = saved.map((attachment) =>
    serializeCodeMirrorMarkdownLink({
      href: attachment.src,
      label: attachment.label,
    })).join(" ");
  const from = Math.min(selection.from, view.state.doc.length);
  const to = Math.min(selection.to, view.state.doc.length);
  view.dispatch({
    changes: { from, insert: markdown, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + markdown.length),
  });
  view.focus();
}

function remoteReplacementRanges(
  markdown: string,
  insertedFrom: number,
  images: readonly RemoteClipboardImage[],
) {
  const replacements: RemoteImageReplacement[] = [];
  let searchFrom = 0;
  for (const image of images) {
    let offset = markdown.indexOf(image.src, searchFrom);
    if (offset < 0) offset = markdown.indexOf(image.src);
    if (offset < 0) continue;
    replacements.push({
      from: insertedFrom + offset,
      id: nextClipboardAssetId("remote-image"),
      image,
      to: insertedFrom + offset + image.src.length,
    });
    searchFrom = offset + image.src.length;
  }
  return replacements;
}

function removeRemoteImage(
  view: CodeMirrorView,
  id: string,
) {
  view.dispatch({ effects: removeRemoteImagesEffect.of(new Set([id])) });
}

function replaceRemoteImage(
  view: CodeMirrorView,
  field: StateField<ClipboardAssetsState>,
  id: string,
  saved: SavedClipboardImage | null,
) {
  const remote = view.state.field(field).remoteImages.find(
    (candidate) => candidate.id === id,
  );
  if (!remote || !saved || view.state.readOnly) {
    removeRemoteImage(view, id);
    return;
  }
  if (view.state.sliceDoc(remote.from, remote.to) !== remote.image.src) {
    removeRemoteImage(view, id);
    return;
  }
  view.dispatch({
    changes: { from: remote.from, insert: saved.src, to: remote.to },
    effects: removeRemoteImagesEffect.of(new Set([id])),
  });
}

function localizeRemoteImages(
  view: CodeMirrorView,
  field: StateField<ClipboardAssetsState>,
  replacements: readonly RemoteImageReplacement[],
  saveRemoteImage: SaveRemoteClipboardImage,
) {
  const savedBySource = new Map<string, Promise<SavedClipboardImage | null>>();
  for (const replacement of replacements) {
    let save = savedBySource.get(replacement.image.src);
    if (!save) {
      save = Promise.resolve(saveRemoteImage(replacement.image));
      savedBySource.set(replacement.image.src, save);
    }
    save.then((saved) => {
      replaceRemoteImage(view, field, replacement.id, saved);
    }).catch((error: unknown) => {
      removeRemoteImage(view, replacement.id);
      console.error("[markra-codemirror-clipboard] failed to save remote image", error);
    });
  }
}

function insertHtmlPaste(
  view: CodeMirrorView,
  event: ClipboardEvent,
  field: StateField<ClipboardAssetsState>,
  saveRemoteImage: SaveRemoteClipboardImage | undefined,
) {
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!html) return false;
  const plainText = event.clipboardData?.getData("text/plain") ?? "";
  const converted = convertCodeMirrorClipboardHtml(html, plainText);
  if (!converted) return false;
  // Rendered rich text can contain an incidental Markdown-looking fragment.
  // Only preserve the raw source when the HTML has no authored document structure.
  if (looksLikeMarkdownSource(plainText) && !converted.structured) return false;

  const { from, to } = view.state.selection.main;
  const replacements = saveRemoteImage
    ? remoteReplacementRanges(converted.markdown, from, converted.remoteImages)
    : [];
  event.preventDefault();
  view.dispatch({
    changes: { from, insert: converted.markdown, to },
    effects: replacements.length > 0
      ? addRemoteImagesEffect.of(replacements)
      : [],
    scrollIntoView: true,
    selection: EditorSelection.cursor(from + converted.markdown.length),
  });
  view.focus();
  if (saveRemoteImage && replacements.length > 0) {
    localizeRemoteImages(view, field, replacements, saveRemoteImage);
  }
  return true;
}

function longestBacktickRun(code: string) {
  return Array.from(code.matchAll(/`+/gu)).reduce(
    (longest, match) => Math.max(longest, match[0].length),
    0,
  );
}

function codeBlockPaddingBefore(state: EditorState, position: number) {
  if (position === 0) return "";
  const before = state.sliceDoc(0, position);
  if (before.endsWith("\n\n")) return "";
  return before.endsWith("\n") ? "\n" : "\n\n";
}

function codeBlockPaddingAfter(state: EditorState, position: number) {
  if (position === state.doc.length) return "";
  const after = state.sliceDoc(position);
  if (after.startsWith("\n\n")) return "";
  return after.startsWith("\n") ? "\n" : "\n\n";
}

function insertDetectedCodePaste(
  view: CodeMirrorView,
  event: ClipboardEvent,
  paste: DetectedCodePaste,
) {
  const { from, to } = view.state.selection.main;
  // Snippets can contain Markdown fences, so the outer fence must be longer
  // than every backtick run in the pasted source.
  const fence = "`".repeat(Math.max(3, longestBacktickRun(paste.code) + 1));
  const before = codeBlockPaddingBefore(view.state, from);
  const after = codeBlockPaddingAfter(view.state, to);
  const opening = `${fence}${paste.language}\n`;
  const block = `${opening}${paste.code}\n${fence}`;
  event.preventDefault();
  view.dispatch({
    changes: { from, insert: `${before}${block}${after}`, to },
    scrollIntoView: true,
    selection: EditorSelection.cursor(
      from + before.length + opening.length + paste.code.length,
    ),
    userEvent: "input.paste",
  });
  view.focus();
  return true;
}

function insertCodePaste(view: CodeMirrorView, event: ClipboardEvent) {
  if (codeMirrorSelectionIsInsideFencedCode(view.state)) return false;
  const text = event.clipboardData?.getData("text/plain") ?? "";
  const paste = detectCodePaste({
    editorData: event.clipboardData?.getData("vscode-editor-data") ?? "",
    html: event.clipboardData?.getData("text/html") ?? "",
    text,
  });
  return paste ? insertDetectedCodePaste(view, event, paste) : false;
}

const droppedPlainMarkdownImagePattern = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)$/u;

function droppedMarkdownImage(
  event: DragEvent,
  documentPath: string | null | undefined,
) {
  const payload = readMarkdownImageDragPayload(event.dataTransfer);
  if (payload) {
    return {
      alt: payload.alt,
      src: markdownImageDragSrcForDocument(payload, documentPath),
    };
  }
  const source = event.dataTransfer?.getData("text/plain")?.trim() ?? "";
  const match = droppedPlainMarkdownImagePattern.exec(source);
  if (!match) return null;
  return {
    alt: (match[1] ?? "").replace(/\\([\\\]])/gu, "$1"),
    src: match[2] ?? "",
  };
}

function dropSelection(view: CodeMirrorView, event: DragEvent) {
  try {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position !== null) return EditorSelection.cursor(position);
  } catch {
    // Synthetic drops and partially implemented WebViews may not expose layout coordinates.
  }
  return EditorSelection.cursor(view.state.selection.main.head);
}

const clipboardTheme = EditorView.baseTheme({
  ".markra-image-upload-placeholder": {
    alignItems: "center",
    display: "inline-flex",
    gap: "0.4em",
    opacity: "0.72",
  },
  ".markra-image-upload-placeholder-spinner": {
    animation: "markra-codemirror-upload-spin 0.9s linear infinite",
    border: "2px solid currentColor",
    borderRightColor: "transparent",
    borderRadius: "999px",
    height: "0.8em",
    width: "0.8em",
  },
  "@keyframes markra-codemirror-upload-spin": {
    to: { transform: "rotate(360deg)" },
  },
});

export function codeMirrorClipboardAssetsPlugin(
  options: CodeMirrorClipboardAssetsPluginOptions = {},
) {
  const field = clipboardAssetsStateField(
    options.uploadLabel ?? "Uploading image...",
  );
  return defineMarkraPlugin({
    id: "markra.clipboard-assets",
    extension: [
      field,
      EditorView.domEventHandlers({
        paste(event, view) {
          if (view.state.readOnly) return false;
          // The shortcut dispatches its own marked paste before WebKit's native paste arrives.
          // Never let the native-event suppression marker consume that synthetic plain-text event.
          if (isPlainTextPaste(event)) return false;
          if (handlePendingPlainTextPasteEvent(event, view.contentDOM)) return true;
          const images = imageFiles(event.clipboardData);
          if (
            images.length > 0 &&
            options.saveImage &&
            !structuredTableClipboard(event)
          ) {
            event.preventDefault();
            saveAndInsertImages(
              view,
              field,
              images,
              options.saveImage,
              view.state.selection.main,
            );
            return true;
          }

          const attachments = attachmentFiles(event.clipboardData);
          if (attachments.length > 0 && options.saveAttachment) {
            event.preventDefault();
            saveAndInsertAttachments(
              view,
              attachments,
              options.saveAttachment,
              view.state.selection.main,
            );
            return true;
          }
          if (insertCodePaste(view, event)) return true;
          return insertHtmlPaste(view, event, field, options.saveRemoteImage);
        },
        drop(event, view) {
          if (view.state.readOnly) return false;
          const selection = dropSelection(view, event);
          const existingImage = droppedMarkdownImage(
            event,
            options.documentPath?.(),
          );
          if (existingImage) {
            event.preventDefault();
            const markdown = serializeCodeMirrorMarkdownImage(existingImage);
            view.dispatch({
              changes: {
                from: selection.from,
                insert: markdown,
                to: selection.to,
              },
              scrollIntoView: true,
              selection: EditorSelection.cursor(selection.from + markdown.length),
            });
            view.focus();
            return true;
          }

          const images = imageFiles(event.dataTransfer);
          if (images.length > 0 && options.saveImage) {
            event.preventDefault();
            saveAndInsertImages(view, field, images, options.saveImage, selection);
            return true;
          }
          const attachments = attachmentFiles(event.dataTransfer);
          if (attachments.length === 0 || !options.saveAttachment) return false;
          event.preventDefault();
          saveAndInsertAttachments(
            view,
            attachments,
            options.saveAttachment,
            selection,
          );
          return true;
        },
      }),
      clipboardTheme,
    ],
  });
}
