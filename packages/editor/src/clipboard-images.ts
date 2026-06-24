import { imageSchema, linkSchema } from "@milkdown/kit/preset/commonmark";
import { Fragment, type MarkType, type Node as ProseNode, type NodeType, type Schema, type Slice } from "@milkdown/kit/prose/model";
import { Plugin, Selection, TextSelection, type SelectionBookmark } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import {
  markdownImageDragSrcForDocument,
  readMarkdownImageDragPayload
} from "@markra/shared";

export type SavedClipboardImage = {
  alt: string;
  src: string;
};

export type SaveClipboardImage = (image: File) => Promise<SavedClipboardImage | null>;

export type SavedClipboardAttachment = {
  label: string;
  src: string;
};

export type SaveClipboardAttachment = (attachment: File) => Promise<SavedClipboardAttachment | null>;

export type RemoteClipboardImage = {
  alt: string;
  src: string;
  title: string;
};

export type SaveRemoteClipboardImage = (image: RemoteClipboardImage) => Promise<SavedClipboardImage | null>;

export type ClipboardImagePluginOptions = {
  documentPath?: () => string | null | undefined;
  saveAttachment?: SaveClipboardAttachment;
  saveRemoteImage?: SaveRemoteClipboardImage;
};

type InsertedRange = {
  from: number;
  to: number;
};

type PendingRemoteImage = RemoteClipboardImage & {
  position: number;
};

type ImageInsertionRange = {
  from: number;
  to: number;
};

const droppedPlainMarkdownImagePattern = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)$/u;

function dataTransferImageFiles(dataTransfer: DataTransfer | null | undefined) {
  const files = dataTransfer?.files as (ArrayLike<File> & { item?: (index: number) => File | null }) | undefined;
  if (!files?.length) return [];

  const images: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = typeof files.item === "function" ? files.item(index) : files[index];
    if (file?.type.startsWith("image/")) images.push(file);
  }

  return images;
}

function dataTransferAttachmentFiles(dataTransfer: DataTransfer | null | undefined) {
  const files = dataTransfer?.files as (ArrayLike<File> & { item?: (index: number) => File | null }) | undefined;
  if (!files?.length) return [];

  const attachments: File[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = typeof files.item === "function" ? files.item(index) : files[index];
    if (file && !file.type.startsWith("image/")) attachments.push(file);
  }

  return attachments;
}

function clipboardImageFiles(event: ClipboardEvent) {
  return dataTransferImageFiles(event.clipboardData);
}

function clipboardAttachmentFiles(event: ClipboardEvent) {
  return dataTransferAttachmentFiles(event.clipboardData);
}

function clipboardHtml(event: ClipboardEvent) {
  return event.clipboardData?.getData("text/html") ?? "";
}

function droppedImageFiles(event: DragEvent) {
  return dataTransferImageFiles(event.dataTransfer);
}

function droppedAttachmentFiles(event: DragEvent) {
  return dataTransferAttachmentFiles(event.dataTransfer);
}

function unescapePlainMarkdownImageAlt(alt: string) {
  return alt.replace(/\\([\\\]])/gu, "$1");
}

function droppedPlainMarkdownImage(event: DragEvent): SavedClipboardImage | null {
  if (typeof event.dataTransfer?.getData !== "function") return null;

  const rawMarkdown = event.dataTransfer.getData("text/plain")?.trim();
  if (!rawMarkdown) return null;

  const match = droppedPlainMarkdownImagePattern.exec(rawMarkdown);
  if (!match) return null;

  return {
    alt: unescapePlainMarkdownImageAlt(match[1]),
    src: match[2]
  };
}

function droppedMarkdownImage(event: DragEvent, documentPath: string | null | undefined): SavedClipboardImage | null {
  const payload = readMarkdownImageDragPayload(event.dataTransfer);
  if (!payload) return droppedPlainMarkdownImage(event);

  return {
    alt: payload.alt,
    src: markdownImageDragSrcForDocument(payload, documentPath)
  };
}

function dropSelectionBookmark(view: EditorView, event: DragEvent) {
  const root = view.root as { elementFromPoint?: unknown };
  if (typeof root.elementFromPoint !== "function") return view.state.selection.getBookmark();

  const position = view.posAtCoords({
    left: event.clientX,
    top: event.clientY
  });
  if (!position) return view.state.selection.getBookmark();

  return Selection.near(view.state.doc.resolve(position.pos)).getBookmark();
}

function createImageFragment(images: SavedClipboardImage[], image: NodeType) {
  return Fragment.fromArray(
    images.map((savedImage) =>
      image.create({
        alt: savedImage.alt || "image",
        src: savedImage.src,
        title: ""
      })
    )
  );
}

function createAttachmentFragment(attachments: SavedClipboardAttachment[], schema: Schema, link: MarkType) {
  const nodes: ProseNode[] = [];

  attachments.forEach((attachment, index) => {
    if (index > 0) nodes.push(schema.text(" "));

    nodes.push(schema.text(attachment.label || attachment.src, [
      link.create({
        href: attachment.src,
        title: ""
      })
    ]));
  });

  return Fragment.fromArray(nodes);
}

function imageInsertionRangeForSelection(selection: Selection): ImageInsertionRange {
  if (!(selection instanceof TextSelection) || !selection.empty) return selection;

  const { $from } = selection;
  if ($from.depth !== 1) return selection;
  if ($from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return selection;

  return {
    from: $from.before(1),
    to: $from.after(1)
  };
}

function isRemoteImageSrc(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function remoteClipboardImageFromNode(node: ProseNode): RemoteClipboardImage | null {
  const { alt, src, title } = node.attrs;
  if (!isRemoteImageSrc(src)) return null;

  return {
    alt: typeof alt === "string" ? alt : "",
    src,
    title: typeof title === "string" ? title : ""
  };
}

function remoteImagesInSlice(slice: Slice, image: NodeType) {
  const remoteImages: RemoteClipboardImage[] = [];

  slice.content.descendants((node) => {
    if (node.type !== image) return;

    const remoteImage = remoteClipboardImageFromNode(node);
    if (remoteImage) remoteImages.push(remoteImage);
  });

  return remoteImages;
}

function insertedRangesFromTransactionMaps(
  maps: readonly {
    forEach: (callback: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => unknown) => unknown;
  }[]
) {
  const ranges: InsertedRange[] = [];

  for (const map of maps) {
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      if (newEnd > newStart) ranges.push({ from: newStart, to: newEnd });
    });
  }

  return ranges;
}

function collectInsertedRemoteImages(
  view: EditorView,
  ranges: InsertedRange[],
  image: NodeType,
  pastedImages: RemoteClipboardImage[]
) {
  const pastedSources = new Set(pastedImages.map((pastedImage) => pastedImage.src));
  const pendingImages: PendingRemoteImage[] = [];
  const seenPositions = new Set<number>();

  for (const range of ranges) {
    const from = Math.max(0, range.from);
    const to = Math.min(view.state.doc.content.size, range.to);
    if (to < from) continue;

    view.state.doc.nodesBetween(from, to, (node, position) => {
      if (node.type !== image || seenPositions.has(position)) return;

      const remoteImage = remoteClipboardImageFromNode(node);
      if (!remoteImage || !pastedSources.has(remoteImage.src)) return;

      seenPositions.add(position);
      pendingImages.push({
        ...remoteImage,
        position
      });
    });
  }

  return pendingImages;
}

function replaceRemoteImage(
  view: EditorView,
  image: NodeType,
  pendingImage: PendingRemoteImage,
  savedImage: SavedClipboardImage
) {
  const currentNode = view.state.doc.nodeAt(pendingImage.position);
  if (!currentNode || currentNode.type !== image || currentNode.attrs.src !== pendingImage.src) return;

  const transaction = view.state.tr.setNodeMarkup(pendingImage.position, undefined, {
    ...currentNode.attrs,
    alt: pendingImage.alt || savedImage.alt || "image",
    src: savedImage.src,
    title: pendingImage.title
  });
  view.dispatch(transaction);
}

async function saveAndReplaceRemoteImages(
  view: EditorView,
  pendingImages: PendingRemoteImage[],
  saveRemoteImage: SaveRemoteClipboardImage,
  image: NodeType
) {
  const savedBySource = new Map<string, Promise<SavedClipboardImage | null>>();

  for (const pendingImage of pendingImages) {
    let savedImagePromise = savedBySource.get(pendingImage.src);
    if (!savedImagePromise) {
      savedImagePromise = saveRemoteImage({
        alt: pendingImage.alt,
        src: pendingImage.src,
        title: pendingImage.title
      });
      savedBySource.set(pendingImage.src, savedImagePromise);
    }

    const savedImage = await savedImagePromise.catch((error: unknown) => {
      console.error("[markra-clipboard-images] failed to save remote pasted image", error);
      return null;
    });
    if (savedImage) replaceRemoteImage(view, image, pendingImage, savedImage);
  }
}

async function saveAndInsertClipboardImages(
  view: EditorView,
  files: File[],
  saveClipboardImage: SaveClipboardImage,
  image: NodeType,
  bookmark: SelectionBookmark = view.state.selection.getBookmark()
) {
  const savedImages: SavedClipboardImage[] = [];

  for (const file of files) {
    const savedImage = await saveClipboardImage(file);
    if (savedImage) savedImages.push(savedImage);
  }

  if (!savedImages.length) return;

  insertSavedClipboardImages(view, savedImages, image, bookmark);
}

async function saveAndInsertClipboardAttachments(
  view: EditorView,
  files: File[],
  saveClipboardAttachment: SaveClipboardAttachment,
  link: MarkType,
  bookmark: SelectionBookmark = view.state.selection.getBookmark()
) {
  const savedAttachments: SavedClipboardAttachment[] = [];

  for (const file of files) {
    const savedAttachment = await saveClipboardAttachment(file);
    if (savedAttachment) savedAttachments.push(savedAttachment);
  }

  if (!savedAttachments.length) return;

  insertSavedClipboardAttachments(view, savedAttachments, link, bookmark);
}

function insertSavedClipboardImages(
  view: EditorView,
  savedImages: SavedClipboardImage[],
  image: NodeType,
  bookmark: SelectionBookmark = view.state.selection.getBookmark()
) {
  const selection = bookmark.resolve(view.state.doc);
  const fragment = createImageFragment(savedImages, image);
  const range = imageInsertionRangeForSelection(selection);
  const transaction = view.state.tr.replaceWith(range.from, range.to, fragment).scrollIntoView();
  const cursor = Math.min(transaction.doc.content.size, range.from + fragment.size);

  transaction.setSelection(Selection.near(transaction.doc.resolve(cursor), -1));
  view.dispatch(transaction);
  view.focus();
}

function insertSavedClipboardAttachments(
  view: EditorView,
  savedAttachments: SavedClipboardAttachment[],
  link: MarkType,
  bookmark: SelectionBookmark = view.state.selection.getBookmark()
) {
  const selection = bookmark.resolve(view.state.doc);
  const fragment = createAttachmentFragment(savedAttachments, view.state.schema, link);
  const transaction = view.state.tr.replaceWith(selection.from, selection.to, fragment).scrollIntoView();
  const cursor = Math.min(transaction.doc.content.size, selection.from + fragment.size);

  transaction.setSelection(TextSelection.near(transaction.doc.resolve(cursor), -1));
  view.dispatch(transaction);
  view.focus();
}

export function markraClipboardImagePlugin(saveClipboardImage: SaveClipboardImage) {
  return markraClipboardImagePluginWithOptions(saveClipboardImage);
}

export function markraClipboardImagePluginWithOptions(
  saveClipboardImage: SaveClipboardImage,
  options: ClipboardImagePluginOptions = {}
) {
  return $prose((ctx) => {
    const image = imageSchema.type(ctx);
    const link = linkSchema.type(ctx);

    return new Plugin({
      props: {
        handlePaste: (view, event, slice) => {
          const files = clipboardImageFiles(event);
          if (files.length) {
            event.preventDefault();
            saveAndInsertClipboardImages(view, files, saveClipboardImage, image).catch((error: unknown) => {
              console.error("[markra-clipboard-images] failed to insert pasted image", error);
            });
            return true;
          }

          const attachmentFiles = clipboardAttachmentFiles(event);
          if (attachmentFiles.length && options.saveAttachment) {
            event.preventDefault();
            saveAndInsertClipboardAttachments(view, attachmentFiles, options.saveAttachment, link).catch((error: unknown) => {
              console.error("[markra-clipboard-images] failed to insert pasted attachment", error);
            });
            return true;
          }

          const saveRemoteImage = options.saveRemoteImage;
          const html = clipboardHtml(event);
          if (!saveRemoteImage || !html || !/<img[\s>]/iu.test(html)) return false;

          const pastedRemoteImages = remoteImagesInSlice(slice, image);
          if (!pastedRemoteImages.length) return false;

          event.preventDefault();
          const transaction = view.state.tr.replaceSelection(slice).scrollIntoView();
          const insertedRanges = insertedRangesFromTransactionMaps(transaction.mapping.maps);
          view.dispatch(transaction);
          view.focus();

          const pendingRemoteImages = collectInsertedRemoteImages(view, insertedRanges, image, pastedRemoteImages);
          if (pendingRemoteImages.length) {
            saveAndReplaceRemoteImages(view, pendingRemoteImages, saveRemoteImage, image).catch((error: unknown) => {
              console.error("[markra-clipboard-images] failed to replace remote pasted images", error);
            });
          }

          return true;
        },
        handleDrop: (view, event) => {
          const droppedMarkdownImageReference = droppedMarkdownImage(event, options.documentPath?.());
          if (droppedMarkdownImageReference) {
            event.preventDefault();
            insertSavedClipboardImages(
              view,
              [droppedMarkdownImageReference],
              image,
              dropSelectionBookmark(view, event)
            );
            return true;
          }

          const files = droppedImageFiles(event);
          if (files.length) {
            event.preventDefault();
            saveAndInsertClipboardImages(
              view,
              files,
              saveClipboardImage,
              image,
              dropSelectionBookmark(view, event)
            ).catch((error: unknown) => {
              console.error("[markra-clipboard-images] failed to insert dropped image", error);
            });
            return true;
          }

          const attachmentFiles = droppedAttachmentFiles(event);
          if (!attachmentFiles.length || !options.saveAttachment) return false;

          event.preventDefault();
          saveAndInsertClipboardAttachments(
            view,
            attachmentFiles,
            options.saveAttachment,
            link,
            dropSelectionBookmark(view, event)
          ).catch((error: unknown) => {
            console.error("[markra-clipboard-images] failed to insert dropped attachment", error);
          });
          return true;
        }
      }
    });
  });
}
