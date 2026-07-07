export type DiagnosticDetailValue = boolean | number | string | null;

export const runtimeDiagnosticEvent = "markra:runtime-diagnostic";

const diagnosticDetailTextLimit = 1200;
const redactedValue = "[redacted]";
const sensitiveDetailKeyPattern = /(?:authorization|endpoint|host|key|password|path|secret|token|url|user)/iu;
const urlPattern = /https?:\/\/[^\s]+/giu;
const absolutePathPattern = /(?:\/Users|\/home|\/private|[A-Za-z]:\\)[^\s]+/gu;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/gu;

export function sanitizeDiagnosticDetails(details: Record<string, unknown> | undefined) {
  if (!details) return undefined;

  const sanitizedDetails: Record<string, DiagnosticDetailValue> = {};
  for (const [key, value] of Object.entries(details)) {
    sanitizedDetails[key] = sensitiveDetailKeyPattern.test(key)
      ? redactedValue
      : sanitizeDiagnosticValue(value);
  }

  return sanitizedDetails;
}

export function sanitizeDiagnosticText(value: string) {
  return limitDiagnosticText(value
    .replace(urlPattern, redactedValue)
    .replace(absolutePathPattern, redactedValue)
    .replace(controlCharacterPattern, " ")
    .trim());
}

export function diagnosticErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim() || error.name;

    return sanitizeDiagnosticText(message);
  }

  if (typeof error === "string") return sanitizeDiagnosticText(error);

  return stringifyDiagnosticValue(error);
}

export function stringifyDiagnosticValue(value: unknown): string {
  if (typeof value === "string") return sanitizeDiagnosticText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return "undefined";
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;

  const seen = new WeakSet<object>();

  try {
    const serialized = JSON.stringify(value, (key, currentValue) => {
      if (key && sensitiveDetailKeyPattern.test(key)) return redactedValue;
      if (currentValue instanceof Error) {
        return {
          message: diagnosticErrorMessage(currentValue),
          name: sanitizeDiagnosticText(currentValue.name)
        };
      }
      if (typeof currentValue === "string") return sanitizeDiagnosticText(currentValue);
      if (typeof currentValue === "bigint") return currentValue.toString();
      if (typeof currentValue === "function") return `[function ${currentValue.name || "anonymous"}]`;
      if (typeof currentValue === "symbol") return currentValue.toString();
      if (typeof currentValue === "object" && currentValue !== null) {
        if (seen.has(currentValue)) return "[circular]";
        seen.add(currentValue);
      }

      return currentValue;
    });

    return limitDiagnosticText(serialized ?? String(value));
  } catch {
    return sanitizeDiagnosticText(String(value));
  }
}

function sanitizeDiagnosticValue(value: unknown): DiagnosticDetailValue {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeDiagnosticText(value);

  return stringifyDiagnosticValue(value);
}

function limitDiagnosticText(value: string) {
  return value.length > diagnosticDetailTextLimit
    ? `${value.slice(0, diagnosticDetailTextLimit)}...[truncated]`
    : value;
}
