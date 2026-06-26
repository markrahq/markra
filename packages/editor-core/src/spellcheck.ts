export type Spellchecker = {
  check: (word: string) => boolean;
  isReady?: () => boolean;
  load?: () => Promise<unknown>;
  suggest?: (word: string) => string[];
};

export type SpellcheckToken = {
  from: number;
  text: string;
  to: number;
};

export type SpellcheckMatch = {
  from: number;
  suggestions: string[];
  to: number;
  word: string;
};
