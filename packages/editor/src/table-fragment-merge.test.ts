import { Schema, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { EditorState, type Transaction } from "@milkdown/kit/prose/state";

type MergeCandidate = {
  fragment: ProseNode;
  fragmentFrom: number;
  fragmentTo: number;
  rows: readonly ProseNode[];
  tableFrom: number;
};

type MergeTransactionFactory = (
  state: EditorState,
  candidate: MergeCandidate
) => Transaction | null;

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    text: { group: "inline" },
    table: {
      content: "table_header_row table_row*",
      group: "block",
      isolating: true,
      tableRole: "table"
    },
    table_header_row: {
      content: "table_header+",
      tableRole: "row"
    },
    table_row: {
      content: "table_cell+",
      tableRole: "row"
    },
    table_header: {
      attrs: {
        colspan: { default: 1 },
        colwidth: { default: null },
        rowspan: { default: 1 }
      },
      content: "paragraph",
      isolating: true,
      tableRole: "header_cell"
    },
    table_cell: {
      attrs: {
        colspan: { default: 1 },
        colwidth: { default: null },
        rowspan: { default: 1 }
      },
      content: "paragraph",
      isolating: true,
      tableRole: "cell"
    }
  }
});

const paragraph = schema.nodes.paragraph;
const table = schema.nodes.table;
const tableHeader = schema.nodes.table_header;
const tableHeaderRow = schema.nodes.table_header_row;
const tableCell = schema.nodes.table_cell;
const tableRow = schema.nodes.table_row;

function textParagraph(text: string) {
  return paragraph.create(null, text ? schema.text(text) : undefined);
}

function headerCell(text: string) {
  return tableHeader.create(null, textParagraph(text));
}

function bodyCell(text: string) {
  return tableCell.create(null, textParagraph(text));
}

function bodyRow(...values: string[]) {
  return tableRow.create(null, values.map(bodyCell));
}

function sampleTable() {
  return table.create(null, [
    tableHeaderRow.create(null, [headerCell("Name"), headerCell("Value")]),
    bodyRow("Alpha", "1")
  ]);
}

function sampleState(fragmentText = "| Beta | 2 |") {
  const currentTable = sampleTable();
  const fragment = textParagraph(fragmentText);
  const doc = schema.topNodeType.create(null, [currentTable, fragment]);

  return {
    candidate: {
      fragment,
      fragmentFrom: currentTable.nodeSize,
      fragmentTo: currentTable.nodeSize + fragment.nodeSize,
      rows: [bodyRow("Beta", "2"), bodyRow("Gamma", "3")],
      tableFrom: 0
    },
    state: EditorState.create({ doc, schema })
  };
}

async function loadMergeTransactionFactory() {
  const editor = await import("./index.ts") as unknown as {
    createTableFragmentMergeTransaction?: MergeTransactionFactory;
  };

  return editor.createTableFragmentMergeTransaction;
}

describe("createTableFragmentMergeTransaction", () => {
  it("appends rows, removes the orphan paragraph, and selects the first new cell", async () => {
    const createTableFragmentMergeTransaction = await loadMergeTransactionFactory();
    const { candidate, state } = sampleState();

    const transaction = createTableFragmentMergeTransaction?.(state, candidate);

    expect(transaction).not.toBeNull();
    expect(transaction?.doc.childCount).toBe(1);
    expect(transaction?.doc.firstChild?.childCount).toBe(4);
    expect(transaction?.selection.$from.parent.textContent).toBe("Beta");
  });

  it("rejects a candidate after its orphan paragraph changes", async () => {
    const createTableFragmentMergeTransaction = await loadMergeTransactionFactory();
    const original = sampleState();
    const changed = sampleState("| Changed | 9 |");

    expect(
      createTableFragmentMergeTransaction?.(changed.state, original.candidate)
    ).toBeNull();
  });

  it("rejects stale positions and non-adjacent fragments", async () => {
    const createTableFragmentMergeTransaction = await loadMergeTransactionFactory();
    const { candidate, state } = sampleState();

    expect(
      createTableFragmentMergeTransaction?.(state, { ...candidate, tableFrom: 1 })
    ).toBeNull();
    expect(
      createTableFragmentMergeTransaction?.(state, {
        ...candidate,
        fragmentFrom: candidate.fragmentFrom + 1,
        fragmentTo: candidate.fragmentTo + 1
      })
    ).toBeNull();
  });

  it("rejects rows whose effective width differs from the current table", async () => {
    const createTableFragmentMergeTransaction = await loadMergeTransactionFactory();
    const { candidate, state } = sampleState();

    expect(
      createTableFragmentMergeTransaction?.(state, {
        ...candidate,
        rows: [bodyRow("Only one cell")]
      })
    ).toBeNull();
  });
});
