export function parseHtmlSpan(attribute: string, value: string | null) {
  const source = value?.trim() ?? "";
  const span = Number(source);
  // HTML uses rowspan="0" for all remaining rows in a group; column spans start at 1.
  const minimum = attribute === "rowspan" ? 0 : 1;
  const maximum = attribute === "rowspan" ? 65534 : 1000;
  return /^\d+$/u.test(source) && span >= minimum && span <= maximum ? span : null;
}
