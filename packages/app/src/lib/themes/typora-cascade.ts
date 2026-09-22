import { generate, lexer, List, parse, walk, type CssNode, type Selector } from "css-tree";

export type TyporaWarning = "unsupported" | "resources" | "syntax";
export type ThemeRole = "html" | "body" | "write" | "code" | "inline" | "link"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "keyword" | "string" | "number" | "title" | "type" | "meta" | "comment";
type Candidate = { value: string; priority: number[] };
type Styles = Map<ThemeRole, Map<string, Candidate>>;

const tokenRoles: Record<string, ThemeRole> = {
  "cm-keyword": "keyword", "cm-string": "string", "cm-number": "number", "cm-def": "title",
  "cm-type": "type", "cm-meta": "meta", "cm-comment": "comment"
};
const inheritedProperties = new Set(["color", "font-family", "font-size", "font-weight", "letter-spacing"]);
const supportedProperties = new Set([...inheritedProperties, "background", "background-color", "color-scheme"]);

function parentRole(role: ThemeRole): ThemeRole | null {
  if (role === "html") return null;
  if (role === "body") return "html";
  if (role === "write") return "body";
  return Object.values(tokenRoles).includes(role) ? "code" : "write";
}

function selectorRole(selector: Selector): ThemeRole | null {
  const parts = generate(selector).replace(/\s*>\s*/g, " ").split(/\s+/);
  if (parts.length === 1 && ["html", ":root", "body", "#write"].includes(parts[0])) {
    return parts[0] === "body" ? "body" : parts[0] === "#write" ? "write" : "html";
  }
  if (parts[0] === "html" || parts[0] === ":root") parts.shift();
  if (parts[0] === "body") parts.shift();
  if (parts[0] === "#write") {
    parts.shift();
    if (parts.length === 0) return "write";
  }
  if (parts.length === 1) {
    const part = parts[0];
    if (/^h[1-6]$/.test(part)) return part as ThemeRole;
    if (part === "a") return "link";
    if (part === "code") return "inline";
    if (["pre", ".md-fences", "pre.md-fences", ".cm-s-inner", ".cm-s-inner.CodeMirror"].includes(part)) return "code";
  }
  if (parts.join(" ") === "pre code") return "code";
  if ([".cm-s-inner", ".md-fences", "pre.md-fences", ".cm-s-inner.CodeMirror"].includes(parts[0])) parts.shift();
  if (parts.length === 1) return tokenRoles[parts[0].replace(/^span\./, "").replace(/^\./, "")] ?? null;
  return null;
}

function specificity(selector: Selector) {
  const weight = [0, 0, 0];
  walk(selector, (node) => {
    if (node.type === "IdSelector") weight[0]++;
    if (node.type === "ClassSelector" || node.type === "PseudoClassSelector") weight[1]++;
    if (node.type === "TypeSelector" && node.name !== "*") weight[2]++;
  });
  return weight;
}

function wins(next: number[], previous: number[]) {
  for (let index = 0; index < next.length; index++) {
    if (next[index] !== previous[index]) return next[index] > previous[index];
  }
  return true;
}

export function readTyporaCascade(css: string) {
  const warnings = new Set<TyporaWarning>();
  const styles: Styles = new Map();
  // This is only a fast path. Classification and conversion use parsed CSS nodes, never text replacement.
  if (!/#write\b|\.md-fences\b|\.cm-s-inner\b|--(?:bg-color|text-color|monospace)\s*:/.test(css)) return null;
  let ast: CssNode;
  try {
    ast = parse(css, { onParseError: () => { warnings.add("syntax"); } });
  } catch {
    return null;
  }
  let typora = false;
  let native = false;
  walk(ast, (node) => {
    if (node.type === "Url") warnings.add("resources");
    if (node.type === "IdSelector" && node.name === "write") typora = true;
    if (node.type === "ClassSelector") {
      if (["md-fences", "cm-s-inner"].includes(node.name)) typora = true;
      if (node.name === "markdown-paper") native = true;
    }
    if (node.type === "Declaration" && ["--bg-color", "--text-color", "--monospace"].includes(node.property)) typora = true;
  });
  if (!typora || native || ast.type !== "StyleSheet") return null;

  let order = 0;
  for (const node of ast.children) {
    if (node.type === "Atrule") {
      if (["import", "font-face"].includes(node.name.toLowerCase())) warnings.add("resources");
      warnings.add("unsupported");
      continue;
    }
    if (node.type !== "Rule" || node.prelude?.type !== "SelectorList") continue;
    for (const selector of node.prelude.children) {
      if (selector.type !== "Selector") continue;
      const role = selectorRole(selector);
      if (!role) { warnings.add("unsupported"); continue; }
      const declarations = styles.get(role) ?? new Map<string, Candidate>();
      styles.set(role, declarations);
      for (const child of node.block.children) {
        if (child.type !== "Declaration") { warnings.add("unsupported"); continue; }
        const property = child.property.startsWith("--") ? child.property : child.property.toLowerCase();
        if (!supportedProperties.has(property) && !property.startsWith("--")) { warnings.add("unsupported"); continue; }
        let deferred = false;
        walk(child.value, (value) => {
          if (value.type === "Function" && value.name.toLowerCase() === "var") deferred = true;
        });
        // Invalid literal declarations are discarded before the cascade; var() is checked at computed-value time.
        if (!property.startsWith("--") && !deferred && !lexer.matchProperty(property, child.value).matched) {
          warnings.add("unsupported");
          continue;
        }
        const priority = [child.important ? 1 : 0, ...specificity(selector), order++];
        const previous = declarations.get(property);
        if (!previous || wins(priority, previous.priority)) declarations.set(property, { value: generate(child.value), priority });
      }
    }
  }

  function find(role: ThemeRole | null, property: string, inherit: boolean): { role: ThemeRole; candidate: Candidate } | undefined {
    if (!role) return undefined;
    const candidate = styles.get(role)?.get(property);
    if (candidate) return { role, candidate };
    return inherit ? find(parentRole(role), property, true) : undefined;
  }

  function findVariable(role: ThemeRole | null, name: string) {
    let found = find(role, name, true);
    while (found) {
      const keyword = found.candidate.value.trim().toLowerCase();
      if (keyword === "inherit" || keyword === "unset") {
        found = find(parentRole(found.role), name, true);
        continue;
      }
      if (keyword === "initial") return undefined;
      if (keyword === "revert" || keyword === "revert-layer") {
        warnings.add("unsupported");
        return undefined;
      }
      return found;
    }
    return undefined;
  }

  const invalidVariables = new Set<string>();
  const checkedVariables = new Set<string>();
  let graphVisits = 0;
  function checkVariable(role: ThemeRole, name: string, ancestors: string[] = []) {
    const found = findVariable(role, name);
    if (!found) return;
    const key = `${found.role}:${name}`;
    const cycleStart = ancestors.indexOf(key);
    if (cycleStart !== -1) {
      ancestors.slice(cycleStart).forEach((member) => invalidVariables.add(member));
      return;
    }
    if (checkedVariables.has(key)) return;
    if (ancestors.length >= 128 || ++graphVisits > 2048) {
      warnings.add("unsupported");
      invalidVariables.add(key);
      return;
    }
    try {
      // CSS dependency cycles include references in every fallback, even branches never substituted.
      const value = parse(found.candidate.value, { context: "value", parseCustomProperty: true });
      walk(value, {
        visit: "Function",
        enter(node) {
          const reference = node.children.first;
          if (node.name.toLowerCase() === "var" && reference?.type === "Identifier") {
            checkVariable(found.role, reference.name, [...ancestors, key]);
          }
        }
      });
    } catch {
      warnings.add("syntax");
      invalidVariables.add(key);
    }
    checkedVariables.add(key);
  }

  function resolve(value: string, role: ThemeRole, budget: { remaining: number }): string | undefined {
    if (--budget.remaining < 0) return undefined;
    let astValue: CssNode;
    try { astValue = parse(value, { context: "value" }); } catch { return undefined; }
    let valid = true;
    walk(astValue, (node) => {
      if (node.type === "Url") { warnings.add("resources"); valid = false; }
    });
    walk(astValue, {
      visit: "Function",
      enter(node, item, list) {
        if (node.name.toLowerCase() !== "var") return;
        const args = node.children.toArray();
        const name = args[0]?.type === "Identifier" ? args[0].name : "";
        if (!name.startsWith("--")) { valid = false; return this.skip; }
        const declaration = findVariable(role, name);
        let replacement: string | undefined;
        if (declaration) {
          const key = `${declaration.role}:${name}`;
          checkVariable(role, name);
          if (!invalidVariables.has(key)) {
            replacement = resolve(declaration.candidate.value, declaration.role, budget);
          }
        }
        const comma = args.findIndex((arg) => arg.type === "Operator" && arg.value === ",");
        if (replacement === undefined && comma !== -1) {
          const fallback = generate({ type: "Value", children: new List<CssNode>().fromArray(args.slice(comma + 1)) });
          replacement = resolve(fallback, role, budget);
        }
        if (replacement === undefined || !item || !list) { valid = false; return this.skip; }
        const parsed = parse(replacement, { context: "value" });
        if (parsed.type === "Value") list.replace(item, parsed.children);
        return this.skip;
      }
    });
    return valid ? generate(astValue) : undefined;
  }

  function value(role: ThemeRole, property: string, inherit = inheritedProperties.has(property) || property.startsWith("--")): string | undefined {
    const found = property.startsWith("--") ? findVariable(role, property) : find(role, property, inherit);
    if (!found) return undefined;
    if (property.startsWith("--")) {
      checkVariable(role, property);
      if (invalidVariables.has(`${found.role}:${property}`)) { warnings.add("unsupported"); return undefined; }
    }
    const raw = found.candidate.value;
    const keyword = raw.trim().toLowerCase();
    if (keyword === "inherit" || (keyword === "unset" && inherit)) {
      const parent = parentRole(found.role);
      return parent ? value(parent, property, true) : undefined;
    }
    if (["initial", "unset", "revert", "revert-layer"].includes(keyword)) return undefined;
    const resolved = resolve(raw, found.role, { remaining: 256 });
    if (resolved === undefined) warnings.add("unsupported");
    return resolved;
  }

  function validated(role: ThemeRole, property: string, inherit?: boolean) {
    const result = value(role, property, inherit);
    if (result === undefined) return undefined;
    if (lexer.matchProperty(property, result).matched) return result;
    warnings.add("unsupported");
    return undefined;
  }

  function background(role: ThemeRole): string | undefined {
    const color = find(role, "background-color", false);
    const shorthand = find(role, "background", false);
    const winner = shorthand && (!color || wins(shorthand.candidate.priority, color.candidate.priority)) ? "background" : "background-color";
    const result = value(role, winner, false);
    if (result === undefined) return undefined;
    if (lexer.matchProperty("background-color", result).matched) return result;
    warnings.add("unsupported");
    return undefined;
  }

  function computedFontSize(role: ThemeRole): number | undefined {
    const parent = parentRole(role);
    const inherited = parent ? computedFontSize(parent) : 16;
    const keyword = styles.get(role)?.get("font-size")?.value.trim().toLowerCase();
    // Inherit the computed size, not the parent's authored em/% expression.
    if (keyword === "inherit" || keyword === "unset") return inherited;
    if (keyword === "initial") return 16;
    const size = value(role, "font-size", false);
    if (size === undefined) return inherited;
    const match = /^(\d*\.?\d+)(px|pt|em|rem|%)$/i.exec(size);
    if (!match) { warnings.add("unsupported"); return undefined; }
    const number = Number(match[1]);
    const unit = match[2].toLowerCase();
    const basis = unit === "rem" ? (role === "html" ? 16 : computedFontSize("html")) : inherited;
    if (["em", "rem", "%"].includes(unit) && basis === undefined) return undefined;
    const pixels = unit === "em" || unit === "rem" ? number * basis! : unit === "%" ? number * basis! / 100
      : unit === "pt" ? number * 4 / 3 : number;
    return Math.round(pixels * 1000) / 1000;
  }

  return { warnings, value, validated, background,
    fontSize: (role: ThemeRole) => styles.get(role)?.has("font-size") ? computedFontSize(role) : undefined
  };
}
