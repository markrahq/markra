import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function readVersion() {
  const explicitVersion = process.env.RELEASE_VERSION?.trim();

  if (explicitVersion) {
    return explicitVersion.replace(/^v/, "");
  }

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

  if (!packageJson.version) {
    throw new Error("package.json version is required.");
  }

  return packageJson.version;
}

function walkFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const currentDir = stack.pop();

    if (!currentDir || !fs.existsSync(currentDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

function moveFile(sourcePath, targetPath, { optional = false } = {}) {
  if (sourcePath === targetPath) {
    return;
  }

  if (!fs.existsSync(sourcePath)) {
    if (optional) {
      return;
    }

    throw new Error(`Release artifact not found: ${sourcePath}`);
  }

  if (fs.existsSync(targetPath)) {
    throw new Error(`Refusing to overwrite release artifact: ${targetPath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
}

function renameArtifact(sourcePath, targetName) {
  const targetPath = path.join(path.dirname(sourcePath), targetName);

  moveFile(sourcePath, targetPath);
  moveFile(`${sourcePath}.sig`, `${targetPath}.sig`, { optional: true });
}

function renameMatchingArtifacts(bundleRoot, getTargetName) {
  const files = walkFiles(bundleRoot).sort();

  for (const filePath of files) {
    const name = path.basename(filePath);

    if (name.endsWith(".sig")) {
      continue;
    }

    const targetName = getTargetName(name);

    if (targetName) {
      renameArtifact(filePath, targetName);
    }
  }
}

function getMacosTargetName(name, context) {
  const { productName, version, arch } = context;

  if (name.endsWith(".app.tar.gz")) {
    return `${productName}_${version}_macos_${arch}_updater.app.tar.gz`;
  }

  if (name.endsWith(".dmg")) {
    return `${productName}_${version}_macos_${arch}.dmg`;
  }

  return null;
}

function getLinuxTargetName(name, context) {
  const { productName, version, arch } = context;

  if (name.endsWith(".AppImage")) {
    return `${productName}_${version}_linux_${arch}.AppImage`;
  }

  if (name.endsWith(".deb")) {
    return `${productName}_${version}_linux_${arch}.deb`;
  }

  if (name.endsWith(".rpm")) {
    return `${productName}_${version}_linux_${arch}.rpm`;
  }

  return null;
}

function getWindowsTargetName(name, context) {
  const { productName, version, arch } = context;

  if (/setup\.exe$/i.test(name)) {
    return `${productName}_${version}_windows_${arch}_setup.exe`;
  }

  if (/\.msi$/i.test(name)) {
    const locale = name.match(/_([a-z]{2}(?:-[a-z]{2})?)\.msi$/i)?.[1];
    const localeSuffix = locale ? `_${locale}` : "";

    return `${productName}_${version}_windows_${arch}${localeSuffix}.msi`;
  }

  return null;
}

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeLocalFileHeader(entry) {
  return Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0x0800),
    writeUInt16(8),
    writeUInt16(0),
    writeUInt16(33),
    writeUInt32(entry.crc),
    writeUInt32(entry.compressedSize),
    writeUInt32(entry.uncompressedSize),
    writeUInt16(entry.name.length),
    writeUInt16(0),
  ]);
}

function makeCentralDirectoryHeader(entry) {
  return Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0x0800),
    writeUInt16(8),
    writeUInt16(0),
    writeUInt16(33),
    writeUInt32(entry.crc),
    writeUInt32(entry.compressedSize),
    writeUInt32(entry.uncompressedSize),
    writeUInt16(entry.name.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(entry.offset),
  ]);
}

function makeEndOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  return Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entryCount),
    writeUInt16(entryCount),
    writeUInt32(centralDirectorySize),
    writeUInt32(centralDirectoryOffset),
    writeUInt16(0),
  ]);
}

function writeZip(outputPath, inputFiles) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const inputFile of inputFiles) {
    const name = Buffer.from(inputFile.name.replace(/\\/g, "/"), "utf8");
    const data = inputFile.data ?? fs.readFileSync(inputFile.path);
    const compressedData = zlib.deflateRawSync(data, { level: 9 });
    const entry = {
      name,
      crc: crc32(data),
      compressedSize: compressedData.length,
      uncompressedSize: data.length,
      offset,
    };
    const localHeader = makeLocalFileHeader(entry);
    const centralHeader = makeCentralDirectoryHeader(entry);

    localParts.push(localHeader, name, compressedData);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + compressedData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((size, part) => size + part.length, 0);
  const endRecord = makeEndOfCentralDirectory(inputFiles.length, centralDirectorySize, centralDirectoryOffset);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.concat([...localParts, ...centralParts, endRecord]));
}

function findWindowsExecutable(releaseRoot, context) {
  const { appSlug, productName } = context;
  const explicitPath = process.env.WINDOWS_EXECUTABLE_PATH?.trim();

  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`Windows executable not found: ${explicitPath}`);
    }

    return explicitPath;
  }

  const candidates = [path.join(releaseRoot, `${appSlug}.exe`), path.join(releaseRoot, `${productName}.exe`)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const executable = fs
    .readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(releaseRoot, entry.name))
    .find((candidate) => !/setup|install/i.test(path.basename(candidate)));

  if (!executable) {
    throw new Error(`Windows portable executable not found in ${releaseRoot}.`);
  }

  return executable;
}

function createWindowsPortableZip(releaseRoot, bundleRoot, context) {
  const { productName, version, arch } = context;
  const executablePath = findWindowsExecutable(releaseRoot, context);
  const executableDir = path.dirname(executablePath);
  const appFolder = productName;
  const portableFiles = [
    {
      path: executablePath,
      name: `${appFolder}/${productName}.exe`,
    },
  ];

  const executableEntries = fs
    .readdirSync(executableDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of executableEntries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".dll")) {
      continue;
    }

    portableFiles.push({
      path: path.join(executableDir, entry.name),
      name: `${appFolder}/${entry.name}`,
    });
  }

  const manifestName = "markra-portable.json";
  const manifest = {
    formatVersion: 1,
    executable: `${productName}.exe`,
    files: [...portableFiles.map((file) => file.name.slice(`${appFolder}/`.length)), manifestName],
  };
  portableFiles.push({
    data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    name: `${appFolder}/${manifestName}`,
  });

  const outputPath = path.join(bundleRoot, "portable", `${productName}_${version}_windows_${arch}_portable.zip`);
  writeZip(outputPath, portableFiles);
}

const appSlug = process.env.APP_SLUG?.trim() || "markra";
const productName = process.env.APP_PRODUCT_NAME?.trim() || "Markra";
const desktopDir = process.env.DESKTOP_DIR?.trim() || "apps/desktop";
const target = requireEnv("TARGET");
const platform = requireEnv("ASSET_PLATFORM");
const arch = requireEnv("ASSET_ARCH");
const version = readVersion();
const releaseRoot = path.join(desktopDir, "src-tauri", "target", target, "release");
const bundleRoot = path.join(releaseRoot, "bundle");
const context = {
  appSlug,
  productName,
  version,
  arch,
};

if (!fs.existsSync(bundleRoot)) {
  throw new Error(`Bundle directory not found: ${bundleRoot}`);
}

if (platform === "macos") {
  renameMatchingArtifacts(bundleRoot, (name) => getMacosTargetName(name, context));
} else if (platform === "linux") {
  renameMatchingArtifacts(bundleRoot, (name) => getLinuxTargetName(name, context));
} else if (platform === "windows") {
  renameMatchingArtifacts(bundleRoot, (name) => getWindowsTargetName(name, context));
  createWindowsPortableZip(releaseRoot, bundleRoot, context);
} else {
  throw new Error(`Unsupported release asset platform: ${platform}`);
}
