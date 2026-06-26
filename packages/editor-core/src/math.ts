import { renderToString, type KatexOptions } from "katex";

export type MarkraMathKind = "display" | "inline";
export type MarkraMathMacros = NonNullable<KatexOptions["macros"]>;

export function createMarkraMathMacros(): MarkraMathMacros {
  return {};
}

export function renderMarkraMathToString(tex: string, kind: MarkraMathKind, macros = createMarkraMathMacros()) {
  return renderToString(tex, {
    displayMode: kind === "display",
    globalGroup: true,
    macros,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false
  });
}

type MarkdownNode = {
  children?: MarkdownNode[];
  data?: unknown;
  meta?: unknown;
  type: string;
  value?: string;
  [key: string]: unknown;
};

type HugoMathKind = "display" | "inline";
type MicromarkCode = number | null;
type MicromarkStateResult = MicromarkState | unknown;
type MicromarkState = (code: MicromarkCode) => MicromarkStateResult;
type MicromarkToken = {
  type: string;
};
type MicromarkEffects = {
  attempt: (construct: MicromarkConstruct, ok: MicromarkState, nok: MicromarkState) => MicromarkState;
  consume: (code: MicromarkCode) => unknown;
  enter: (type: string) => MicromarkToken;
  exit: (type: string) => unknown;
};
type MicromarkConstruct = {
  concrete?: boolean;
  name: string;
  partial?: boolean;
  previous?: (code: MicromarkCode) => boolean;
  tokenize: (effects: MicromarkEffects, ok: MicromarkState, nok: MicromarkState) => MicromarkState;
};
type HugoMathCompileContext = {
  buffer: () => unknown;
  config: {
    enter: {
      data: (this: HugoMathCompileContext, token: unknown) => unknown;
    };
    exit: {
      data: (this: HugoMathCompileContext, token: unknown) => unknown;
    };
  };
  data: Record<string, unknown>;
  enter: (node: MarkdownNode, token: unknown) => unknown;
  exit: (token: unknown) => unknown;
  resume: () => string;
  stack: MarkdownNode[];
};
type MathMarkdownNode = MarkdownNode & {
  data?: unknown;
  value?: string;
};
type RemarkProcessorData = {
  fromMarkdownExtensions?: unknown[];
  micromarkExtensions?: unknown[];
};

const micromarkCodes = {
  backslash: 92,
  carriageReturn: -5,
  carriageReturnLineFeed: -3,
  horizontalTab: -2,
  leftParenthesis: 40,
  leftSquareBracket: 91,
  lineFeed: -4,
  rightParenthesis: 41,
  rightSquareBracket: 93,
  space: 32,
  virtualSpace: -1
} as const;
const micromarkTypes = {
  lineEnding: "lineEnding",
  linePrefix: "linePrefix",
  whitespace: "whitespace"
} as const;
const hugoMathFlowType = "markraHugoMathFlow";
const hugoMathFlowDataType = "markraHugoMathFlowValue";
const hugoMathFlowFenceType = "markraHugoMathFlowFence";
const hugoMathFlowSequenceType = "markraHugoMathFlowFenceSequence";
const hugoMathFlowInsideKey = "markraHugoMathFlowInside";
const hugoMathTextType = "markraHugoMathText";
const hugoMathTextDataType = "markraHugoMathTextData";
const hugoMathTextSequenceType = "markraHugoMathTextSequence";

function isMicromarkLineEnding(code: MicromarkCode) {
  return (
    code === micromarkCodes.carriageReturn ||
    code === micromarkCodes.lineFeed ||
    code === micromarkCodes.carriageReturnLineFeed
  );
}

function isMicromarkSpace(code: MicromarkCode) {
  return (
    code === micromarkCodes.horizontalTab ||
    code === micromarkCodes.space ||
    code === micromarkCodes.virtualSpace
  );
}

function markraHugoMathPrevious(code: MicromarkCode) {
  return code !== micromarkCodes.backslash;
}

function consumeMicromarkSpace(
  effects: MicromarkEffects,
  ok: MicromarkState,
  type: string,
  max?: number
): MicromarkState {
  let size = 0;

  return start;

  function start(code: MicromarkCode): MicromarkStateResult {
    if (!isMicromarkSpace(code) || (typeof max === "number" && size >= max)) return ok(code);

    effects.enter(type);
    return space(code);
  }

  function space(code: MicromarkCode): MicromarkStateResult {
    if (isMicromarkSpace(code) && (typeof max !== "number" || size < max)) {
      effects.consume(code);
      size += 1;
      return space;
    }

    effects.exit(type);
    return ok(code);
  }
}

function createMathMarkdownData(kind: HugoMathKind, value: string) {
  return kind === "display"
    ? {
        hChildren: [
          {
            children: [{ type: "text", value }],
            properties: { className: ["language-math", "math-display"] },
            tagName: "code",
            type: "element"
          }
        ],
        hName: "pre"
      }
    : {
        hChildren: [{ type: "text", value }],
        hName: "code",
        hProperties: {
          className: ["language-math", "math-inline"]
        }
      };
}

function markraHugoMathFlow(): MicromarkConstruct {
  return {
    concrete: true,
    name: hugoMathFlowType,
    tokenize(effects, ok, nok) {
      return start;

      function start(code: MicromarkCode): MicromarkStateResult {
        if (code !== micromarkCodes.backslash) return nok(code);

        effects.enter(hugoMathFlowType);
        effects.enter(hugoMathFlowFenceType);
        effects.enter(hugoMathFlowSequenceType);
        effects.consume(code);
        return openingDelimiter;
      }

      function openingDelimiter(code: MicromarkCode): MicromarkStateResult {
        if (code !== micromarkCodes.leftSquareBracket) return nok(code);

        effects.consume(code);
        effects.exit(hugoMathFlowSequenceType);
        return consumeMicromarkSpace(effects, openingLineEnd, micromarkTypes.whitespace);
      }

      function openingLineEnd(code: MicromarkCode): MicromarkStateResult {
        if (code === null) {
          effects.exit(hugoMathFlowFenceType);
          effects.exit(hugoMathFlowType);
          return ok(code);
        }

        if (!isMicromarkLineEnding(code)) return nok(code);

        effects.exit(hugoMathFlowFenceType);
        return beforeContent(code);
      }

      function beforeContent(code: MicromarkCode): MicromarkStateResult {
        if (code === null) {
          effects.exit(hugoMathFlowType);
          return ok(code);
        }

        if (isMicromarkLineEnding(code)) {
          effects.enter(micromarkTypes.lineEnding);
          effects.consume(code);
          effects.exit(micromarkTypes.lineEnding);
          return lineStart;
        }

        return lineStart(code);
      }

      function lineStart(code: MicromarkCode): MicromarkStateResult {
        return effects.attempt(
          {
            name: `${hugoMathFlowType}ClosingFence`,
            partial: true,
            tokenize: tokenizeHugoMathFlowClosingFence
          },
          after,
          contentStart
        )(code);
      }

      function contentStart(code: MicromarkCode): MicromarkStateResult {
        if (code === null) return after(code);
        if (isMicromarkLineEnding(code)) return beforeContent(code);

        effects.enter(hugoMathFlowDataType);
        return contentChunk(code);
      }

      function contentChunk(code: MicromarkCode): MicromarkStateResult {
        if (code === null || isMicromarkLineEnding(code)) {
          effects.exit(hugoMathFlowDataType);
          return beforeContent(code);
        }

        effects.consume(code);
        return contentChunk;
      }

      function after(code: MicromarkCode): MicromarkStateResult {
        effects.exit(hugoMathFlowType);
        return ok(code);
      }
    }
  };
}

function tokenizeHugoMathFlowClosingFence(
  effects: MicromarkEffects,
  ok: MicromarkState,
  nok: MicromarkState
): MicromarkState {
  return consumeMicromarkSpace(effects, beforeSequenceClose, micromarkTypes.linePrefix, 3);

  function beforeSequenceClose(code: MicromarkCode): MicromarkStateResult {
    if (code !== micromarkCodes.backslash) return nok(code);

    effects.enter(hugoMathFlowFenceType);
    effects.enter(hugoMathFlowSequenceType);
    effects.consume(code);
    return sequenceClose;
  }

  function sequenceClose(code: MicromarkCode): MicromarkStateResult {
    if (code !== micromarkCodes.rightSquareBracket) return nok(code);

    effects.consume(code);
    effects.exit(hugoMathFlowSequenceType);
    return consumeMicromarkSpace(effects, afterSequenceClose, micromarkTypes.whitespace);
  }

  function afterSequenceClose(code: MicromarkCode): MicromarkStateResult {
    if (code === null || isMicromarkLineEnding(code)) {
      effects.exit(hugoMathFlowFenceType);
      return ok(code);
    }

    return nok(code);
  }
}

function markraHugoMathText(): MicromarkConstruct {
  return {
    name: hugoMathTextType,
    previous: markraHugoMathPrevious,
    tokenize(effects, ok, nok) {
      let closingCode: typeof micromarkCodes.rightParenthesis | typeof micromarkCodes.rightSquareBracket;
      let sequenceToken: MicromarkToken;

      return start;

      function start(code: MicromarkCode): MicromarkStateResult {
        if (code !== micromarkCodes.backslash) return nok(code);

        effects.enter(hugoMathTextType);
        effects.enter(hugoMathTextSequenceType);
        effects.consume(code);
        return openingDelimiter;
      }

      function openingDelimiter(code: MicromarkCode): MicromarkStateResult {
        if (code === micromarkCodes.leftParenthesis) {
          closingCode = micromarkCodes.rightParenthesis;
        } else if (code === micromarkCodes.leftSquareBracket) {
          closingCode = micromarkCodes.rightSquareBracket;
        } else {
          return nok(code);
        }

        effects.consume(code);
        effects.exit(hugoMathTextSequenceType);
        return between;
      }

      function between(code: MicromarkCode): MicromarkStateResult {
        if (code === null) return nok(code);

        if (code === micromarkCodes.backslash) {
          sequenceToken = effects.enter(hugoMathTextSequenceType);
          effects.consume(code);
          return closingDelimiter;
        }

        if (isMicromarkLineEnding(code)) {
          effects.enter(micromarkTypes.lineEnding);
          effects.consume(code);
          effects.exit(micromarkTypes.lineEnding);
          return between;
        }

        effects.enter(hugoMathTextDataType);
        return data(code);
      }

      function data(code: MicromarkCode): MicromarkStateResult {
        if (code === null || code === micromarkCodes.backslash || isMicromarkLineEnding(code)) {
          effects.exit(hugoMathTextDataType);
          return between(code);
        }

        effects.consume(code);
        return data;
      }

      function closingDelimiter(code: MicromarkCode): MicromarkStateResult {
        if (code === closingCode) {
          effects.consume(code);
          effects.exit(hugoMathTextSequenceType);
          effects.exit(hugoMathTextType);
          return ok;
        }

        sequenceToken.type = hugoMathTextDataType;
        return data(code);
      }
    }
  };
}

export function markraHugoMathSyntax() {
  return {
    flow: {
      [micromarkCodes.backslash]: markraHugoMathFlow()
    },
    text: {
      [micromarkCodes.backslash]: markraHugoMathText()
    }
  };
}

export function markraHugoMathFromMarkdown() {
  return {
    enter: {
      [hugoMathFlowType]: function enterHugoMathFlow(this: HugoMathCompileContext, token: unknown) {
        this.enter(
          {
            data: createMathMarkdownData("display", ""),
            meta: null,
            type: "math",
            value: ""
          },
          token
        );
      },
      [hugoMathTextType]: function enterHugoMathText(this: HugoMathCompileContext, token: unknown) {
        this.enter(
          {
            data: createMathMarkdownData("inline", ""),
            type: "inlineMath",
            value: ""
          },
          token
        );
        this.buffer();
      }
    },
    exit: {
      [hugoMathFlowDataType]: function exitHugoMathFlowData(this: HugoMathCompileContext, token: unknown) {
        this.config.enter.data.call(this, token);
        this.config.exit.data.call(this, token);
      },
      [hugoMathFlowFenceType]: function exitHugoMathFlowFence(this: HugoMathCompileContext) {
        if (this.data[hugoMathFlowInsideKey]) return;

        this.buffer();
        this.data[hugoMathFlowInsideKey] = true;
      },
      [hugoMathFlowType]: function exitHugoMathFlow(this: HugoMathCompileContext, token: unknown) {
        const data = this.resume().replace(/^(\r?\n|\r)|(\r?\n|\r)$/gu, "");
        const node = this.stack[this.stack.length - 1] as MathMarkdownNode;
        this.exit(token);
        node.value = data;
        node.data = createMathMarkdownData("display", data);
        this.data[hugoMathFlowInsideKey] = undefined;
      },
      [hugoMathTextDataType]: function exitHugoMathTextData(this: HugoMathCompileContext, token: unknown) {
        this.config.enter.data.call(this, token);
        this.config.exit.data.call(this, token);
      },
      [hugoMathTextType]: function exitHugoMathText(this: HugoMathCompileContext, token: unknown) {
        const data = this.resume();
        const node = this.stack[this.stack.length - 1] as MathMarkdownNode;
        this.exit(token);
        node.value = data;
        node.data = createMathMarkdownData("inline", data);
      }
    }
  };
}

export function remarkHugoMath(this: { data: () => RemarkProcessorData }) {
  const data = this.data();
  const micromarkExtensions = data.micromarkExtensions ?? (data.micromarkExtensions = []);
  const fromMarkdownExtensions = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = []);

  micromarkExtensions.push(markraHugoMathSyntax());
  fromMarkdownExtensions.push(markraHugoMathFromMarkdown());
}

function isEscaped(text: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function skipMathWhitespace(source: string, index: number) {
  let cursor = index;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? "")) cursor += 1;
  return cursor;
}

function readMathCommand(source: string, index: number) {
  if (source[index] !== "\\") return null;

  let cursor = index + 1;
  while (cursor < source.length && /[a-zA-Z]/u.test(source[cursor] ?? "")) cursor += 1;
  if (cursor === index + 1 && cursor < source.length) cursor += 1;

  return {
    command: source.slice(index, cursor),
    to: cursor
  };
}

function readBalancedMathGroup(source: string, index: number, open: "{" | "[", close: "}" | "]") {
  if (source[index] !== open) return null;

  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === open && !isEscaped(source, cursor)) {
      depth += 1;
      continue;
    }

    if (character !== close || isEscaped(source, cursor)) continue;

    depth -= 1;
    if (depth === 0) return cursor + 1;
  }

  return null;
}

function readMathMacroNameArgument(source: string, index: number) {
  const cursor = skipMathWhitespace(source, index);
  if (source[cursor] === "{") {
    const groupEnd = readBalancedMathGroup(source, cursor, "{", "}");
    return groupEnd === null ? null : groupEnd;
  }

  return readMathCommand(source, cursor)?.to ?? null;
}

function readOptionalMathMacroArgument(source: string, index: number) {
  const cursor = skipMathWhitespace(source, index);
  if (source[cursor] !== "[") return index;

  return readBalancedMathGroup(source, cursor, "[", "]");
}

function readRequiredMathMacroReplacement(source: string, index: number) {
  const cursor = skipMathWhitespace(source, index);
  return readBalancedMathGroup(source, cursor, "{", "}");
}

function readNewcommandDefinition(source: string, index: number) {
  const command = readMathCommand(source, index);
  if (!command || !["\\newcommand", "\\renewcommand", "\\providecommand"].includes(command.command)) return null;

  let cursor = skipMathWhitespace(source, command.to);
  if (source[cursor] === "*") cursor += 1;

  const macroNameEnd = readMathMacroNameArgument(source, cursor);
  if (macroNameEnd === null) return null;

  cursor = macroNameEnd;

  const argumentCountEnd = readOptionalMathMacroArgument(source, cursor);
  if (argumentCountEnd === null) return null;
  cursor = argumentCountEnd;

  const optionalDefaultEnd = readOptionalMathMacroArgument(source, cursor);
  if (optionalDefaultEnd === null) return null;
  cursor = optionalDefaultEnd;

  return readRequiredMathMacroReplacement(source, cursor);
}

export function isMarkraMathMacroDefinitionSource(tex: string) {
  let cursor = skipMathWhitespace(tex, 0);
  let foundDefinition = false;

  while (cursor < tex.length) {
    const nextCursor = readNewcommandDefinition(tex, cursor);
    if (nextCursor === null) return false;

    foundDefinition = true;
    cursor = skipMathWhitespace(tex, nextCursor);
  }

  return foundDefinition;
}
