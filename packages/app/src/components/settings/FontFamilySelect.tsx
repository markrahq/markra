import { Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  normalizeSystemFontFamilyName,
  systemFontFamilyCssValue
} from "../../lib/editor-font";
import type { AppSystemFontFamily } from "../../runtime";

type FontFamilyOption = {
  family: string | null;
  label: string;
};

function fontFamilyOptions(
  family: string | null,
  systemFontFamilies: readonly AppSystemFontFamily[],
  defaultLabel: string
): FontFamilyOption[] {
  const options = new Map<string, FontFamilyOption>();
  for (const systemFontFamily of systemFontFamilies) {
    const normalizedFamily = normalizeSystemFontFamilyName(systemFontFamily.family);
    if (!normalizedFamily) continue;

    const normalizedLabel = normalizeSystemFontFamilyName(systemFontFamily.label) ?? normalizedFamily;
    if (!options.has(normalizedFamily)) {
      options.set(normalizedFamily, {
        family: normalizedFamily,
        label: normalizedLabel
      });
    }
  }
  if (options.size === 0 && family !== null) {
    options.set(family, {
      family,
      label: family
    });
  }

  return [
    { family: null, label: defaultLabel },
    ...Array.from(options.values())
      .sort((first, second) => first.label.localeCompare(second.label) || first.family!.localeCompare(second.family!))
  ];
}

function optionMatchesQuery(option: FontFamilyOption, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return option.label.toLocaleLowerCase().includes(normalizedQuery);
}

function optionStyle(option: FontFamilyOption): CSSProperties | undefined {
  if (option.family === null) return undefined;

  return {
    fontFamily: systemFontFamilyCssValue(option.family, "var(--font-ui)")
  };
}

export function FontFamilySelect({
  defaultLabel,
  family,
  label,
  onChange,
  systemFontFamilies
}: {
  defaultLabel: string;
  family: string | null;
  label: string;
  onChange: (family: string | null) => unknown;
  systemFontFamilies: readonly AppSystemFontFamily[];
}) {
  const listboxId = `settings-font-family-options-${useId()}`;
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(
    () => fontFamilyOptions(family, systemFontFamilies, defaultLabel),
    [defaultLabel, family, systemFontFamilies]
  );
  const value = family === null
    ? options[0]!
    : options.find((option) => option.family === family) ?? options[0]!;
  const inputValue = open ? query : value.label;
  const inputStyle = open ? undefined : optionStyle(value);
  const visibleOptions = useMemo(
    () => options.filter((option) => optionMatchesQuery(option, query)),
    [options, query]
  );
  const activeOption = visibleOptions[activeIndex] ?? visibleOptions[0];

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  const selectOption = (option: FontFamilyOption) => {
    setQuery("");
    setOpen(false);
    onChange(option.family);
  };
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (visibleOptions.length === 0) return;
      setActiveIndex((currentIndex) => Math.min(currentIndex + 1, visibleOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (visibleOptions.length === 0) return;
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      selectOption(activeOption);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="relative inline-flex min-w-56 items-center">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 z-10 text-(--text-secondary)"
        size={13}
      />
      <input
        className="h-8 w-56 rounded-md border border-(--border-default) bg-(--bg-primary) py-0 pr-3 pl-8 text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent)"
        type="text"
        role="combobox"
        aria-activedescendant={open && activeOption ? `${listboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-label={label}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={value.label}
        spellCheck={false}
        style={inputStyle}
        value={inputValue}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <div
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-md border border-(--border-default) bg-(--bg-primary) py-1 shadow-[0_12px_34px_rgba(0,0,0,0.14)]"
          id={listboxId}
          role="listbox"
        >
          {visibleOptions.map((option, index) => (
            <button
              key={option.family ?? "default"}
              className="flex h-8 w-full cursor-pointer items-center border-0 bg-transparent px-3 text-left text-[12px] leading-5 font-[560] text-(--text-heading) transition-colors duration-150 ease-out hover:bg-(--bg-hover) focus:bg-(--bg-hover) focus:outline-none aria-selected:bg-(--bg-active)"
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={option.family === value.family}
              style={optionStyle(option)}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
