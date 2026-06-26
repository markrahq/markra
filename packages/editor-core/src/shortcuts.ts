import {
  defaultKeyboardShortcuts,
  formatKeyboardShortcut,
  keyboardShortcutActions,
  keyboardShortcutFromKeyboardEvent,
  keyboardShortcutToKeyboardEventInit,
  keyboardShortcutToNativeAccelerator,
  normalizeKeyboardShortcuts,
  parseKeyboardShortcut,
  type KeyboardShortcutAction,
  type KeyboardShortcutBindings,
  type KeyboardShortcutMap,
  type ParsedKeyboardShortcut
} from "@markra/shared";

export const markdownShortcutActions = keyboardShortcutActions;
export const defaultMarkdownShortcuts = defaultKeyboardShortcuts;
export const formatMarkdownShortcut = formatKeyboardShortcut;
export const markdownShortcutFromKeyboardEvent = keyboardShortcutFromKeyboardEvent;
export const markdownShortcutToKeyboardEventInit = keyboardShortcutToKeyboardEventInit;
export const markdownShortcutToNativeAccelerator = keyboardShortcutToNativeAccelerator;
export const normalizeMarkdownShortcuts = normalizeKeyboardShortcuts;
export const parseMarkdownShortcut = parseKeyboardShortcut;

export type MarkdownShortcutAction = KeyboardShortcutAction;
export type MarkdownShortcutBindings = KeyboardShortcutBindings;
export type MarkdownShortcutMap = KeyboardShortcutMap;
export type ParsedMarkdownShortcut = ParsedKeyboardShortcut;
