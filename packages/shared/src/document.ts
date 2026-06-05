export type DocumentState = {
  path: string | null;
  name: string;
  content: string;
  sizeBytes?: number;
  dirty: boolean;
  open: boolean;
  revision: number;
};
