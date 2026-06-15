import {
  pointerWithin,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type UniqueIdentifier
} from "@dnd-kit/core";
import { FileText, Folder, ImageIcon } from "lucide-react";
import {
  type ReactNode,
  type SyntheticEvent
} from "react";
import type { NativeMarkdownFolderFile } from "../../lib/tauri";

type FileTreeDragData = {
  file: NativeMarkdownFolderFile;
};

type FileTreeDropData = {
  targetParentPath: string | null;
};

type FileTreeDragSourceRenderProps = {
  attributes: Partial<Omit<DraggableAttributes, "aria-pressed" | "role">>;
  isDragging: boolean;
  listeners: Record<string, (event: SyntheticEvent<HTMLElement>) => unknown>;
  setNodeRef: (element: HTMLElement | null) => undefined;
};

type FileTreeDragSourceProps = {
  children: (props: FileTreeDragSourceRenderProps) => ReactNode;
  disabled?: boolean;
  file: NativeMarkdownFolderFile;
};

type FileTreeDropTargetProps = {
  children: (props: { setNodeRef: (element: HTMLElement | null) => undefined }) => ReactNode;
  disabled?: boolean;
  id: UniqueIdentifier;
  targetParentPath: string | null;
};

function fileTreeDragId(file: NativeMarkdownFolderFile) {
  return `file-tree-drag:${file.path}`;
}

function fileTreeDropId(name: string) {
  return `file-tree-drop:${name}`;
}

export function fileTreeFolderDropId(path: string | null | undefined) {
  return fileTreeDropId(path ?? "__missing__");
}

export function fileTreeFolderChildrenDropId(path: string | null | undefined) {
  return fileTreeDropId(`children:${path ?? "__missing__"}`);
}

export function fileTreeRootDropId(name: string) {
  return fileTreeDropId(`root:${name}`);
}

export function fileTreeDragData(value: unknown): FileTreeDragData | null {
  const data = value as Partial<FileTreeDragData> | null | undefined;
  return data?.file ? { file: data.file } : null;
}

export function fileTreeDropData(value: unknown): FileTreeDropData | null {
  const data = value as Partial<FileTreeDropData> | null | undefined;
  if (!data || !("targetParentPath" in data)) return null;
  return { targetParentPath: data.targetParentPath ?? null };
}

export const fileTreeCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const folderCollisions = collisions.filter((collision) => {
    const dropData = fileTreeDropData(collision.data?.droppableContainer.data.current);
    return dropData?.targetParentPath !== null;
  });

  if (folderCollisions.length === 0) return collisions;

  return [...folderCollisions].sort((left, right) => {
    const leftRect = left.data?.droppableContainer.rect.current;
    const rightRect = right.data?.droppableContainer.rect.current;
    const leftArea = leftRect ? leftRect.width * leftRect.height : Number.MAX_SAFE_INTEGER;
    const rightArea = rightRect ? rightRect.width * rightRect.height : Number.MAX_SAFE_INTEGER;

    return leftArea - rightArea;
  });
};

export function combineNodeRefs<T extends HTMLElement>(
  ...setNodeRefs: ((element: T | null) => unknown)[]
) {
  return (element: T | null) => {
    setNodeRefs.forEach((setNodeRef) => {
      setNodeRef(element);
    });
    return undefined;
  };
}

function fileTreeDraggableAttributes(
  attributes: DraggableAttributes,
  disabled: boolean
): FileTreeDragSourceRenderProps["attributes"] {
  if (disabled) return {};

  return {
    "aria-describedby": attributes["aria-describedby"],
    "aria-disabled": attributes["aria-disabled"],
    "aria-roledescription": attributes["aria-roledescription"],
    tabIndex: attributes.tabIndex
  };
}

function fileTreeDraggableListeners(
  listeners: DraggableSyntheticListeners,
  disabled: boolean
): FileTreeDragSourceRenderProps["listeners"] {
  if (disabled) return {};

  return Object.fromEntries(
    Object.entries(listeners ?? {}).map(([eventName, listener]) => {
      const dragListener = listener as (event: SyntheticEvent<HTMLElement>) => unknown;

      return [
        eventName,
        (event: SyntheticEvent<HTMLElement>) => dragListener(event)
      ];
    })
  );
}

export function FileTreeDragSource({
  children,
  disabled = false,
  file
}: FileTreeDragSourceProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef
  } = useDraggable({
    id: fileTreeDragId(file),
    data: { file } satisfies FileTreeDragData,
    disabled
  });

  return children({
    attributes: fileTreeDraggableAttributes(attributes, disabled),
    isDragging,
    listeners: fileTreeDraggableListeners(listeners, disabled),
    setNodeRef: (element) => {
      setNodeRef(element);
      return undefined;
    }
  });
}

export function FileTreeDropTarget({
  children,
  disabled = false,
  id,
  targetParentPath
}: FileTreeDropTargetProps) {
  const { setNodeRef } = useDroppable({
    id,
    data: { targetParentPath } satisfies FileTreeDropData,
    disabled
  });

  return children({
    setNodeRef: (element) => {
      setNodeRef(element);
      return undefined;
    }
  });
}

export function FileTreeDragOverlay({
  file
}: {
  file: NativeMarkdownFolderFile | null;
}) {
  if (!file) return null;

  const FileIcon = file.kind === "folder" ? Folder : file.kind === "asset" ? ImageIcon : FileText;

  return (
    <div
      className="grid h-8 min-w-44 max-w-72 grid-cols-[17px_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-(--border-default) bg-(--bg-primary) px-2 text-[13px] leading-none text-(--text-heading) opacity-80 shadow-[0_12px_28px_color-mix(in_srgb,var(--text-heading)_18%,transparent)]"
      data-testid="file-tree-drag-overlay"
    >
      <FileIcon aria-hidden="true" className="shrink-0" size={15} />
      <span className="min-w-0 truncate">{file.relativePath}</span>
    </div>
  );
}
