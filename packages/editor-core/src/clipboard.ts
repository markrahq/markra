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
