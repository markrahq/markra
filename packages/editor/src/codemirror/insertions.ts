import {
  EditorSelection,
  EditorState,
  type ChangeSpec,
} from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { defineMarkraPlugin } from "./plugin.ts";

export type InsertionCommandId = "insert.today";

export type InsertionLabels = Record<InsertionCommandId, string>;

export interface InsertionsPluginOptions {
  labels?: Partial<InsertionLabels>;
  now?: () => Date;
}

const defaultInsertionLabels: InsertionLabels = {
  "insert.today": "Today",
};

function isEditable(view: EditorView) {
  return !view.state.facet(EditorState.readOnly);
}

function twoDigits(value: number) {
  return value.toString().padStart(2, "0");
}

function localDate(date: Date) {
  // Keep the user's calendar day at UTC boundaries; toISOString() can produce
  // yesterday or tomorrow for users outside UTC.
  return [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join("-");
}

function insertText(view: EditorView, text: string) {
  if (!isEditable(view)) return false;
  const { state } = view;
  const changes: ChangeSpec[] = state.selection.ranges.map((range) => ({
    from: range.from,
    insert: text,
    to: range.to,
  }));
  const changeSet = state.changes(changes);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) =>
      EditorSelection.cursor(changeSet.mapPos(range.to, 1)),
    ),
    state.selection.mainIndex,
  );

  view.dispatch({
    changes: changeSet,
    scrollIntoView: true,
    selection,
    userEvent: "input",
  });
  view.focus();
  return true;
}

export function insertionsPlugin(options: InsertionsPluginOptions = {}) {
  const labels = { ...defaultInsertionLabels, ...options.labels };
  const now = options.now ?? (() => new Date());

  return defineMarkraPlugin({
    id: "markra.insertions",
    commands: [
      {
        id: "insert.today",
        isEnabled: isEditable,
        label: labels["insert.today"],
        run: (view) => insertText(view, localDate(now())),
      },
    ],
    ui: [
      {
        command: "insert.today",
        group: "insert",
        icon: "calendar-days",
        keywords: ["today", "date", "current date", "今天", "日期"],
        order: 140,
        placement: "slash-menu",
      },
    ],
  });
}
