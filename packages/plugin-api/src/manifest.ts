export const pluginCapabilities = [
  "settings",
  "commands",
  "sidePanel",
  "editor",
  "contextMenu",
  "workspaceFiles",
  "pandocExport"
] as const;

export type PluginCapability = typeof pluginCapabilities[number];

const pluginCapabilitySet = new Set<string>(pluginCapabilities);

export const pluginFileReadPermissionGrants = ["none", "userSelected", "workspace"] as const;
export const pluginFileWritePermissionGrants = ["none", "userSelected"] as const;

export type PluginFileReadPermissionGrant = typeof pluginFileReadPermissionGrants[number];
export type PluginFileWritePermissionGrant = typeof pluginFileWritePermissionGrants[number];
export type PluginPermissionGrant = PluginFileReadPermissionGrant | PluginFileWritePermissionGrant;

const pluginPermissionGrantSet = new Set<string>([
  ...pluginFileReadPermissionGrants,
  ...pluginFileWritePermissionGrants
]);
const pluginFileReadPermissionGrantSet = new Set<string>(pluginFileReadPermissionGrants);
const pluginFileWritePermissionGrantSet = new Set<string>(pluginFileWritePermissionGrants);

export type PluginPermissions = {
  files: {
    read: PluginFileReadPermissionGrant;
    write: PluginFileWritePermissionGrant;
  };
  native: false;
  network: false;
};

export type PluginManifest = {
  apiVersion: number;
  author?: string;
  capabilities: PluginCapability[];
  description: string;
  homepage?: string;
  id: string;
  license?: string;
  main: string;
  name: string;
  permissions: PluginPermissions;
  style?: string;
  version: string;
};

export function isPluginCapability(value: unknown): value is PluginCapability {
  return typeof value === "string" && pluginCapabilitySet.has(value);
}

export function isPluginPermissionGrant(value: unknown): value is PluginPermissionGrant {
  return typeof value === "string" && pluginPermissionGrantSet.has(value);
}

export function isPluginManifest(value: unknown): value is PluginManifest {
  return listPluginManifestProblems(value).length === 0;
}

export function listPluginManifestProblems(value: unknown) {
  const problems: string[] = [];

  if (!isRecord(value)) return ["manifest must be an object."];

  if (!isKebabCaseId(value.id)) {
    problems.push("id must be lowercase kebab-case.");
  }

  if (!isNonEmptyString(value.name)) {
    problems.push("name must be a non-empty string.");
  }

  if (!isNonEmptyString(value.version)) {
    problems.push("version must be a non-empty string.");
  }

  const apiVersion = value.apiVersion;
  if (typeof apiVersion !== "number" || !Number.isInteger(apiVersion) || apiVersion <= 0) {
    problems.push("apiVersion must be a positive integer.");
  }

  if (!isNonEmptyString(value.description)) {
    problems.push("description must be a non-empty string.");
  }

  if (!isNonEmptyString(value.main)) {
    problems.push("main must be a non-empty string.");
  }

  if (value.style !== undefined && !isNonEmptyString(value.style)) {
    problems.push("style must be a non-empty string when provided.");
  }

  if (value.author !== undefined && !isNonEmptyString(value.author)) {
    problems.push("author must be a non-empty string when provided.");
  }

  if (value.homepage !== undefined && !isNonEmptyString(value.homepage)) {
    problems.push("homepage must be a non-empty string when provided.");
  }

  if (value.license !== undefined && !isNonEmptyString(value.license)) {
    problems.push("license must be a non-empty string when provided.");
  }

  validateCapabilities(value.capabilities, problems);
  validatePermissions(value.permissions, problems);

  return problems;
}

function validateCapabilities(value: unknown, problems: string[]) {
  if (!Array.isArray(value)) {
    problems.push("capabilities must be an array.");
    return;
  }

  value.forEach((capability, index) => {
    if (!isPluginCapability(capability)) {
      problems.push(`capabilities[${index}] "${String(capability)}" is not supported.`);
    }
  });
}

function validatePermissions(value: unknown, problems: string[]) {
  if (!isRecord(value)) {
    problems.push("permissions must be an object.");
    return;
  }

  if (!isRecord(value.files)) {
    problems.push("permissions.files must be an object.");
  } else {
    if (!pluginFileReadPermissionGrantSet.has(String(value.files.read))) {
      problems.push(`permissions.files.read "${String(value.files.read)}" is not supported.`);
    }

    if (!pluginFileWritePermissionGrantSet.has(String(value.files.write))) {
      problems.push(`permissions.files.write "${String(value.files.write)}" is not supported.`);
    }
  }

  if (value.network !== false) {
    problems.push("permissions.network must be false.");
  }

  if (value.native !== false) {
    problems.push("permissions.native must be false.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKebabCaseId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}
