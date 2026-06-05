export type SearchRange = {
  from: number;
  to: number;
};

export type WorkspaceSearchScope = "content" | "file" | "path";

export type WorkspaceSearchTerm = {
  caseSensitive: boolean;
  query: string;
  scope: WorkspaceSearchScope;
};

export type WorkspaceSearchQueryGroup = {
  exclude: WorkspaceSearchTerm[];
  include: WorkspaceSearchTerm[];
};

export type WorkspaceSearchQueryPlan = {
  groups: WorkspaceSearchQueryGroup[];
  query: string;
};

export type WorkspaceSearchQueryDescription =
  | {
      kind: "exclude" | "include";
      query: string;
      scope: WorkspaceSearchScope;
    }
  | {
      kind: "or";
    };

type SearchOptions = {
  caseSensitive?: boolean;
  maxMatches?: number;
};

type WorkspaceSearchQueryOptions = {
  caseSensitive?: boolean;
};

export function findSearchRanges(text: string, query: string, options: SearchOptions = {}): SearchRange[] {
  if (!query) return [];

  const ranges: SearchRange[] = [];
  const maxMatches = Math.max(0, options.maxMatches ?? Number.POSITIVE_INFINITY);
  if (maxMatches === 0) return ranges;

  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  let from = 0;

  while (from <= text.length - query.length) {
    const candidate = text.slice(from, from + query.length);
    const matches = options.caseSensitive
      ? candidate === query
      : candidate.toLocaleLowerCase() === needle;

    if (matches) {
      ranges.push({
        from,
        to: from + query.length
      });
      if (ranges.length >= maxMatches) return ranges;
      from += Math.max(1, query.length);
      continue;
    }

    from += 1;
  }

  return ranges;
}

export function normalizeSearchIndex(index: number, count: number) {
  if (count <= 0) return -1;

  return ((index % count) + count) % count;
}

export function parseWorkspaceSearchQuery(
  query: string,
  options: WorkspaceSearchQueryOptions = {}
): WorkspaceSearchQueryPlan | null {
  const tokens = tokenizeWorkspaceSearchQuery(query.trim());
  if (tokens.length === 0) return null;

  const groups: WorkspaceSearchQueryGroup[] = [];
  let currentGroup: WorkspaceSearchQueryGroup = {
    exclude: [],
    include: []
  };
  const pushCurrentGroup = () => {
    if (currentGroup.include.length === 0 && currentGroup.exclude.length === 0) return;

    groups.push(currentGroup);
    currentGroup = {
      exclude: [],
      include: []
    };
  };

  tokens.forEach((token) => {
    if (token === "OR") {
      pushCurrentGroup();
      return;
    }

    const parsed = parseWorkspaceSearchToken(token, options.caseSensitive === true);
    if (!parsed) return;

    currentGroup[parsed.excluded ? "exclude" : "include"].push(parsed.term);
  });

  pushCurrentGroup();
  if (groups.length === 0) return null;

  return {
    groups,
    query: query.trim()
  };
}

export function describeWorkspaceSearchQuery(
  query: string,
  options: WorkspaceSearchQueryOptions = {}
): WorkspaceSearchQueryDescription[] {
  const plan = parseWorkspaceSearchQuery(query, options);
  if (!plan) return [];

  return plan.groups.flatMap((group, groupIndex) => {
    const descriptions: WorkspaceSearchQueryDescription[] = [];
    if (groupIndex > 0) descriptions.push({ kind: "or" });

    group.include.forEach((term) => {
      descriptions.push({
        kind: "include",
        query: term.query,
        scope: term.scope
      });
    });
    group.exclude.forEach((term) => {
      descriptions.push({
        kind: "exclude",
        query: term.query,
        scope: term.scope
      });
    });

    return descriptions;
  });
}

export function workspaceSearchContentHighlightTerms(
  query: string,
  options: WorkspaceSearchQueryOptions = {}
): WorkspaceSearchTerm[] {
  const plan = parseWorkspaceSearchQuery(query, options);
  if (!plan) return [];

  return plan.groups.flatMap((group) =>
    group.include.filter((term) => term.scope === "content")
  );
}

export function isStructuredWorkspaceSearchQuery(query: string) {
  return tokenizeWorkspaceSearchQuery(query).some((token) =>
    token === "OR" || token.startsWith("-") || /^[a-z-]+:/iu.test(token)
  );
}

function tokenizeWorkspaceSearchQuery(query: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;

  for (const character of query) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/u.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (escaped) current += "\\";
  if (current) tokens.push(current);

  return tokens;
}

function parseWorkspaceSearchToken(token: string, defaultCaseSensitive: boolean) {
  const excluded = token.startsWith("-");
  const normalizedToken = excluded ? token.slice(1) : token;
  if (!normalizedToken) return null;

  const operator = normalizedToken.match(/^([a-z-]+):(.*)$/iu);
  const operatorName = operator?.[1]?.toLowerCase();
  const operatorValue = operator?.[2] ?? normalizedToken;
  if (operatorName && !isWorkspaceSearchOperator(operatorName)) {
    return {
      excluded,
      term: {
        caseSensitive: defaultCaseSensitive,
        query: normalizedToken,
        scope: "content" as const
      }
    };
  }
  if (!operatorValue) return null;

  if (operatorName === "match-case" || operatorName === "ignore-case") {
    return {
      excluded,
      term: {
        caseSensitive: operatorName === "match-case",
        query: operatorValue,
        scope: "content" as const
      }
    };
  }

  return {
    excluded,
    term: {
      caseSensitive: defaultCaseSensitive,
      query: operatorValue,
      scope: workspaceSearchScopeForOperator(operatorName)
    }
  };
}

function isWorkspaceSearchOperator(operator: string) {
  return operator === "content"
    || operator === "file"
    || operator === "ignore-case"
    || operator === "match-case"
    || operator === "path";
}

function workspaceSearchScopeForOperator(operator: string | undefined): WorkspaceSearchScope {
  if (operator === "file") return "file";
  if (operator === "path") return "path";

  return "content";
}
