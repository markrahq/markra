import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SpellcheckMatch } from "@markra/editor";
import { t, type AppLanguage } from "@markra/shared";

export type SpellcheckSuggestionMenuState = {
  left: number;
  match: SpellcheckMatch;
  top: number;
};

export function SpellcheckSuggestionMenu({
  language,
  menu,
  onAddIgnoredWord,
  onReplace
}: {
  language: AppLanguage;
  menu: SpellcheckSuggestionMenuState;
  onAddIgnoredWord: () => unknown;
  onReplace: (suggestion: string) => unknown;
}) {
  const suggestions = uniqueSpellcheckSuggestions(menu.match.suggestions);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const style: CSSProperties = {
    left: menu.left,
    top: menu.top
  };
  const label = t(language, "editor.spellcheckSuggestions");
  const actionCount = suggestions.length + 1;

  useEffect(() => {
    setSelectedIndex(0);
  }, [menu.match.from, menu.match.to, menu.match.word]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.focus();
  }, [selectedIndex, suggestions.length]);

  function runSelectedAction() {
    const suggestion = suggestions[selectedIndex];
    if (suggestion) {
      onReplace(suggestion);
      return;
    }

    onAddIgnoredWord();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % actionCount);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + actionCount) % actionCount);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setSelectedIndex(actionCount - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      runSelectedAction();
    }
  }

  return (
    <div
      aria-label={label}
      className="fixed z-50 min-w-42 rounded-md border border-(--border-default) bg-(--bg-primary) p-1 text-[12px] leading-5 shadow-lg"
      role="menu"
      style={style}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => event.preventDefault()}
    >
      {suggestions.map((suggestion, index) => (
        <button
          className="block w-full rounded-sm px-2 py-1 text-left text-(--text-primary) hover:bg-(--bg-hover) focus:bg-(--bg-hover) focus:outline-none"
          key={suggestion}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          role="menuitem"
          tabIndex={selectedIndex === index ? 0 : -1}
          type="button"
          onFocus={() => setSelectedIndex(index)}
          onClick={() => onReplace(suggestion)}
        >
          {spellcheckMenuLabel(language, "editor.spellcheckReplaceWith", suggestion)}
        </button>
      ))}
      <button
        className="mt-1 block w-full border-t border-(--border-default) px-2 py-1.5 text-left text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-heading) focus:bg-(--bg-hover) focus:text-(--text-heading) focus:outline-none"
        ref={(node) => {
          itemRefs.current[suggestions.length] = node;
        }}
        role="menuitem"
        tabIndex={selectedIndex === suggestions.length ? 0 : -1}
        type="button"
        onFocus={() => setSelectedIndex(suggestions.length)}
        onClick={onAddIgnoredWord}
      >
        {spellcheckMenuLabel(language, "editor.spellcheckAddToWhitelist", menu.match.word)}
      </button>
    </div>
  );
}

function uniqueSpellcheckSuggestions(suggestions: readonly string[]) {
  return Array.from(new Set(suggestions.map((suggestion) => suggestion.trim()).filter(Boolean))).slice(0, 5);
}

function spellcheckMenuLabel(
  language: AppLanguage,
  key: "editor.spellcheckReplaceWith" | "editor.spellcheckAddToWhitelist",
  word: string
) {
  return t(language, key).replace("{word}", word);
}
