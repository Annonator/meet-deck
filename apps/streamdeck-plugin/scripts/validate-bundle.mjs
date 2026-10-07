import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { inflateRawSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "../../..");
const PLUGIN_DIRECTORY = path.resolve(SCRIPT_DIRECTORY, "../dev.annonator.meet-deck.sdPlugin");
const MANIFEST_PATH = path.join(PLUGIN_DIRECTORY, "manifest.json");
const EXPECTED_PLUGIN_UUID = "dev.annonator.meet-deck";
const EXPECTED_PROJECT_URL = "https://github.com/Annonator/meet-deck";
const EXPECTED_SUPPORT_URL = `${EXPECTED_PROJECT_URL}/issues`;
const EXPECTED_PROPERTY_INSPECTOR_LINKS = new Set([
  `${EXPECTED_PROJECT_URL}/blob/main/docs/en/setup.md`,
  EXPECTED_SUPPORT_URL
]);
const EXPECTED_PROPERTY_INSPECTOR_ASSETS = new Set([
  "link:href:property-inspector.css",
  "script:src:property-inspector.js"
]);
const EXPECTED_ACTIONS = new Map([
  [
    `${EXPECTED_PLUGIN_UUID}.microphone`,
    {
      capability: "microphone",
      icon: "imgs/actions/microphone/icon",
      name: "Microphone",
      runtimeClass: "MicrophoneAction",
      states: ["imgs/actions/microphone/off", "imgs/actions/microphone/on"]
    }
  ],
  [
    `${EXPECTED_PLUGIN_UUID}.camera`,
    {
      capability: "camera",
      icon: "imgs/actions/camera/icon",
      name: "Camera",
      runtimeClass: "CameraAction",
      states: ["imgs/actions/camera/off", "imgs/actions/camera/on"]
    }
  ],
  [
    `${EXPECTED_PLUGIN_UUID}.hand`,
    {
      capability: "hand",
      icon: "imgs/actions/hand/icon",
      name: "Hand",
      runtimeClass: "HandAction",
      states: ["imgs/actions/hand/off", "imgs/actions/hand/on"]
    }
  ],
  [
    `${EXPECTED_PLUGIN_UUID}.presentation`,
    {
      capability: "presentation",
      icon: "imgs/actions/presentation/icon",
      name: "Presentation",
      runtimeClass: "PresentationAction",
      states: ["imgs/actions/presentation/off", "imgs/actions/presentation/on"]
    }
  ]
]);
// Pin alpha channels, not compressed PNG bytes, so only visible artwork changes require review.
const EXPECTED_ACTION_LIST_ALPHA_HASHES = new Map([
  [
    "imgs/plugin/category-icon",
    [
      "faccdb66b3c13f93ce35e0251aa2c7df9496074f2655dca1a07ab50b4cecc882",
      "9013b84dbbd2ea8f696fea3b5605c992b81a6bce4226a083bc284fafae213d2f"
    ]
  ],
  [
    "imgs/actions/microphone/icon",
    [
      "9846c5f0bdfc6629492cf020761c49fa2b4b9a53ff631b1ae8ce90c392a699fa",
      "97d56fd3a62378a90736801968c514dc3aca8e0508385a4719a8ef7d375a4bde"
    ]
  ],
  [
    "imgs/actions/camera/icon",
    [
      "fa2c432f49d55ca323f515191dab59b0a10deb2b489dba2edee17c70358672df",
      "de1908cdb6b1687b0037a30988a0a93f92e018c6b90c1a660ee3ffc0dd67acbb"
    ]
  ],
  [
    "imgs/actions/hand/icon",
    [
      "bcca3a526b92779c6f21d635c9560f9cd199acdcfc05a2e22bf84ef2574703c1",
      "3cb38b1843bf5ba670fb47663bad2808957eba62caba188fe51eaa7a0e01f20b"
    ]
  ],
  [
    "imgs/actions/presentation/icon",
    [
      "933cc0a8624b42c7e8bdeafbbc7f1cf945d10cf87bbb6cca3cb45783ef47f2d6",
      "13030e29867d612a8f7c1f2685c652f90af404e6182b6a1bb1027adb62cc1cf6"
    ]
  ]
]);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const REQUIRED_SDIGNORE_ENTRIES = new Set(["logs/", "**/*.map", "**/.DS_Store"]);
const REQUIRED_STATUS_IMAGES = new Set([
  "imgs/status/ambiguous.svg",
  "imgs/status/offline.svg",
  "imgs/status/pending.svg",
  "imgs/status/unknown.svg"
]);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertSameValues(actual, expected, description) {
  const actualValues = sorted(actual);
  const expectedValues = sorted(expected);
  invariant(
    JSON.stringify(actualValues) === JSON.stringify(expectedValues),
    `${description} mismatch. Expected ${JSON.stringify(expectedValues)}, got ${JSON.stringify(actualValues)}.`
  );
}

function safePluginPath(relativePath) {
  invariant(typeof relativePath === "string" && relativePath.length > 0, "Manifest path is empty.");
  invariant(!path.isAbsolute(relativePath), `Manifest path must be relative: ${relativePath}`);
  invariant(
    !relativePath.includes("\\"),
    `Manifest path must use forward slashes: ${relativePath}`
  );
  const resolved = path.resolve(PLUGIN_DIRECTORY, relativePath);
  invariant(
    resolved.startsWith(`${PLUGIN_DIRECTORY}${path.sep}`),
    `Manifest path escapes the plugin directory: ${relativePath}`
  );
  return resolved;
}

async function assertFile(relativePath) {
  const filePath = safePluginPath(relativePath);
  const fileStats = await stat(filePath);
  invariant(fileStats.isFile(), `Expected a regular plugin file: ${relativePath}`);
  return filePath;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(buffer, label) {
  invariant(
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `${label} is not a PNG.`
  );

  let offset = PNG_SIGNATURE.length;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let imageDataEnded = false;
  const compressedParts = [];
  while (offset < buffer.length) {
    invariant(offset + 12 <= buffer.length, `${label} has a truncated PNG chunk.`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    invariant(dataEnd + 4 <= buffer.length, `${label} has a truncated ${type} chunk.`);
    invariant(
      crc32(buffer.subarray(offset + 4, dataEnd)) === buffer.readUInt32BE(dataEnd),
      `${label} has an invalid ${type} chunk CRC.`
    );
    if (type === "IHDR") {
      invariant(
        !sawHeader && offset === PNG_SIGNATURE.length,
        `${label} has an invalid IHDR order.`
      );
      invariant(length === 13, `${label} has an invalid IHDR chunk.`);
      sawHeader = true;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      invariant(
        buffer[dataStart + 10] === 0 && buffer[dataStart + 11] === 0,
        `${label} uses unsupported PNG compression or filtering.`
      );
      interlace = buffer[dataStart + 12];
    } else if (type === "IDAT") {
      invariant(sawHeader && !imageDataEnded, `${label} has an invalid IDAT order.`);
      sawImageData = true;
      compressedParts.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      invariant(sawHeader && sawImageData && length === 0, `${label} has an invalid IEND chunk.`);
      sawEnd = true;
      offset = dataEnd + 4;
      invariant(offset === buffer.length, `${label} has trailing data after IEND.`);
      break;
    } else {
      invariant(sawHeader, `${label} has a chunk before IHDR.`);
      invariant(
        (type.charCodeAt(0) & 0x20) !== 0,
        `${label} contains unsupported critical PNG chunk ${type}.`
      );
      imageDataEnded ||= sawImageData;
    }
    offset = dataEnd + 4;
  }

  invariant(sawEnd, `${label} has no IEND chunk.`);
  invariant(width > 0 && height > 0, `${label} has no valid dimensions.`);
  invariant(bitDepth === 8, `${label} must use 8-bit channels.`);
  invariant(colorType === 6 || colorType === 4, `${label} must have an alpha channel.`);
  invariant(interlace === 0, `${label} must be non-interlaced.`);
  invariant(compressedParts.length > 0, `${label} has no image data.`);

  const channels = colorType === 6 ? 4 : 2;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(compressedParts));
  invariant(
    inflated.length === height * (stride + 1),
    `${label} has an unexpected decompressed size.`
  );

  const scanlines = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (stride + 1);
    const filter = inflated[sourceOffset];
    invariant(filter <= 4, `${label} uses unsupported PNG filter ${filter}.`);
    for (let x = 0; x < stride; x += 1) {
      const encoded = inflated[sourceOffset + 1 + x];
      const left = x >= channels ? scanlines[y * stride + x - channels] : 0;
      const above = y > 0 ? scanlines[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? scanlines[(y - 1) * stride + x - channels] : 0;
      let value;
      switch (filter) {
        case 0:
          value = encoded;
          break;
        case 1:
          value = encoded + left;
          break;
        case 2:
          value = encoded + above;
          break;
        case 3:
          value = encoded + Math.floor((left + above) / 2);
          break;
        case 4:
          value = encoded + paeth(left, above, upperLeft);
          break;
      }
      scanlines[y * stride + x] = value & 0xff;
    }
  }

  const pixels = [];
  for (let offset_ = 0; offset_ < scanlines.length; offset_ += channels) {
    if (colorType === 6) {
      pixels.push([
        scanlines[offset_],
        scanlines[offset_ + 1],
        scanlines[offset_ + 2],
        scanlines[offset_ + 3]
      ]);
    } else {
      pixels.push([
        scanlines[offset_],
        scanlines[offset_],
        scanlines[offset_],
        scanlines[offset_ + 1]
      ]);
    }
  }
  return { height, pixels, width };
}

function alphaBounds(image) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let alphaTotal = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.pixels[y * image.width + x][3];
      alphaTotal += alpha;
      if (alpha > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return {
    alphaCoverage: alphaTotal / (255 * image.width * image.height),
    bottom: bottom / image.height,
    left: left / image.width,
    right: (right + 1) / image.width,
    top: top / image.height
  };
}

function validateMonochromePixels(image, label) {
  let transparent = 0;
  let visible = 0;
  let fullyOpaque = 0;
  const alphaBytes = Buffer.alloc(image.pixels.length);

  for (let index = 0; index < image.pixels.length; index += 1) {
    const [red, green, blue, alpha] = image.pixels[index];
    alphaBytes[index] = alpha;
    if (alpha === 0) {
      transparent += 1;
    } else {
      visible += 1;
      fullyOpaque += alpha === 255 ? 1 : 0;
      invariant(
        red === 255 && green === 255 && blue === 255,
        `${label} contains non-white visible pixel rgba(${red}, ${green}, ${blue}, ${alpha}).`
      );
    }
  }

  invariant(transparent > 0, `${label} has no transparent background pixels.`);
  invariant(visible > 0, `${label} has no visible artwork.`);
  invariant(fullyOpaque > 0, `${label} has no fully opaque white artwork.`);

  for (let x = 0; x < image.width; x += 1) {
    invariant(image.pixels[x][3] === 0, `${label} must have a transparent outer perimeter.`);
    invariant(
      image.pixels[(image.height - 1) * image.width + x][3] === 0,
      `${label} must have a transparent outer perimeter.`
    );
  }
  for (let y = 0; y < image.height; y += 1) {
    invariant(
      image.pixels[y * image.width][3] === 0,
      `${label} must have a transparent outer perimeter.`
    );
    invariant(
      image.pixels[y * image.width + image.width - 1][3] === 0,
      `${label} must have a transparent outer perimeter.`
    );
  }

  return createHash("sha256").update(alphaBytes).digest("hex");
}

async function validatePngPair(basePath, size, { monochrome = false } = {}) {
  const images = [];
  for (const [suffix, expectedSize] of [
    [".png", size],
    ["@2x.png", size * 2]
  ]) {
    const relativePath = `${basePath}${suffix}`;
    const image = decodePng(await readFile(await assertFile(relativePath)), relativePath);
    invariant(
      image.width === expectedSize && image.height === expectedSize,
      `${relativePath} must be ${expectedSize}x${expectedSize}, got ${image.width}x${image.height}.`
    );
    const alphaHash = monochrome ? validateMonochromePixels(image, relativePath) : undefined;
    images.push({ alphaHash, image });
  }

  if (monochrome) {
    const expectedAlphaHashes = EXPECTED_ACTION_LIST_ALPHA_HASHES.get(basePath);
    invariant(expectedAlphaHashes, `No approved action-list artwork is pinned for ${basePath}.`);
    assertSameValues(
      images.map(({ alphaHash }) => alphaHash),
      expectedAlphaHashes,
      `${basePath} approved alpha silhouettes`
    );

    const baseBounds = alphaBounds(images[0].image);
    const highDpiBounds = alphaBounds(images[1].image);
    for (const key of ["left", "top", "right", "bottom", "alphaCoverage"]) {
      invariant(
        Math.abs(baseBounds[key] - highDpiBounds[key]) <= 0.08,
        `${basePath} base and @2x artwork do not have matching normalized ${key}.`
      );
    }

    let alphaDifference = 0;
    let intersection = 0;
    let union = 0;
    const baseImage = images[0].image;
    const highDpiImage = images[1].image;
    for (let y = 0; y < baseImage.height; y += 1) {
      for (let x = 0; x < baseImage.width; x += 1) {
        const baseAlpha = baseImage.pixels[y * baseImage.width + x][3];
        const highDpiAlpha =
          ([
            [x * 2, y * 2],
            [x * 2 + 1, y * 2],
            [x * 2, y * 2 + 1],
            [x * 2 + 1, y * 2 + 1]
          ].reduce(
            (total, [sampleX, sampleY]) =>
              total + highDpiImage.pixels[sampleY * highDpiImage.width + sampleX][3],
            0
          ) +
            2) >>
          2;
        alphaDifference += Math.abs(baseAlpha - highDpiAlpha);
        const baseVisible = baseAlpha >= 64;
        const highDpiVisible = highDpiAlpha >= 64;
        intersection += baseVisible && highDpiVisible ? 1 : 0;
        union += baseVisible || highDpiVisible ? 1 : 0;
      }
    }
    const normalizedDifference = alphaDifference / (255 * baseImage.width * baseImage.height);
    invariant(
      normalizedDifference <= 0.08,
      `${basePath} base and @2x alpha shapes differ by ${normalizedDifference.toFixed(3)}.`
    );
    invariant(
      union > 0 && intersection / union >= 0.85,
      `${basePath} base and @2x visible silhouettes do not match.`
    );
  }
  return images[0].alphaHash;
}

async function walkFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    invariant(!entry.isSymbolicLink(), `Plugin bundle must not contain symlinks: ${relativePath}`);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath, relativePath)));
    } else {
      invariant(entry.isFile(), `Plugin bundle contains a non-regular entry: ${relativePath}`);
      files.push(relativePath);
    }
  }
  return files;
}

function isSdIgnored(relativePath) {
  return (
    relativePath.startsWith("logs/") ||
    relativePath.endsWith(".map") ||
    path.posix.basename(relativePath) === ".DS_Store"
  );
}

function parseRuntimeActions(source) {
  return new Map(
    [
      ...source.matchAll(
        /@action\(\{\s*UUID:\s*"([^"]+)"\s*\}\)\s*export class (\w+) extends MeetAction\s*\{\s*override readonly capability = "([^"]+)" as const;/g
      )
    ].map((match) => [match[1], { capability: match[3], runtimeClass: match[2] }])
  );
}

function validateBundledActionMappings(bundleSource) {
  const bundledActionUuids = new Set(
    [...bundleSource.matchAll(/action\(\{ UUID: "([^"]+)" \}\)/g)]
      .map((match) => match[1])
      .filter((uuid) => uuid.startsWith(`${EXPECTED_PLUGIN_UUID}.`))
  );
  assertSameValues(bundledActionUuids, EXPECTED_ACTIONS.keys(), "Bundled action UUIDs");
  for (const [uuid, expectedAction] of EXPECTED_ACTIONS) {
    const marker = `let ${expectedAction.runtimeClass} = (() => {`;
    const blockStart = bundleSource.indexOf(marker);
    invariant(blockStart >= 0, `Bundled runtime is missing ${expectedAction.runtimeClass}.`);
    const nextBlock = bundleSource.indexOf("\nlet ", blockStart + marker.length);
    const block = bundleSource.slice(blockStart, nextBlock >= 0 ? nextBlock : undefined);
    invariant(
      block.includes(`action({ UUID: "${uuid}" })`) &&
        block.includes(`capability = "${expectedAction.capability}";`),
      `Bundled ${expectedAction.runtimeClass} must map ${uuid} to ${expectedAction.capability}.`
    );
  }
}

function expectedBundleFiles(manifest, propertyInspectorDependencies, runtimeStatusPaths) {
  const files = new Set([
    ".sdignore",
    "LICENSE",
    "THIRD_PARTY_NOTICES",
    "manifest.json",
    manifest.CodePath,
    "bin/package.json",
    manifest.PropertyInspectorPath,
    ...propertyInspectorDependencies,
    ...runtimeStatusPaths
  ]);
  for (const basePath of [manifest.CategoryIcon, manifest.Icon]) {
    files.add(`${basePath}.png`);
    files.add(`${basePath}@2x.png`);
  }
  for (const action of manifest.Actions) {
    files.add(action.PropertyInspectorPath ?? manifest.PropertyInspectorPath);
    files.add(`${action.Icon}.png`);
    files.add(`${action.Icon}@2x.png`);
    for (const state of action.States) {
      files.add(`${state.Image}.png`);
      files.add(`${state.Image}@2x.png`);
    }
  }
  return files;
}

async function loadBundleContext() {
  const [manifest, rootPackage, pluginPackage, protocolPackage, chromePackage, chromeManifest] =
    await Promise.all([
      readJson(MANIFEST_PATH),
      readJson(path.join(WORKSPACE_DIRECTORY, "package.json")),
      readJson(path.join(WORKSPACE_DIRECTORY, "apps/streamdeck-plugin/package.json")),
      readJson(path.join(WORKSPACE_DIRECTORY, "packages/protocol/package.json")),
      readJson(path.join(WORKSPACE_DIRECTORY, "apps/chrome-extension/package.json")),
      readJson(path.join(WORKSPACE_DIRECTORY, "apps/chrome-extension/public/manifest.json"))
    ]);
  return { chromeManifest, chromePackage, manifest, pluginPackage, protocolPackage, rootPackage };
}

export async function validateSourceBundle() {
  const { chromeManifest, chromePackage, manifest, pluginPackage, protocolPackage, rootPackage } =
    await loadBundleContext();

  invariant(manifest.UUID === EXPECTED_PLUGIN_UUID, `Unexpected plugin UUID: ${manifest.UUID}`);
  invariant(
    path.basename(PLUGIN_DIRECTORY) === `${manifest.UUID}.sdPlugin`,
    "Plugin directory name must match manifest UUID."
  );
  invariant(
    manifest.Name === "Meet Deck" && manifest.Category === manifest.Name,
    "Plugin name/category mismatch."
  );
  invariant(manifest.Author === "annonator", `Unexpected manifest author: ${manifest.Author}`);
  invariant(manifest.URL === EXPECTED_PROJECT_URL, `Unexpected project URL: ${manifest.URL}`);
  invariant(
    manifest.SupportURL === EXPECTED_SUPPORT_URL,
    `Unexpected support URL: ${manifest.SupportURL}`
  );
  invariant(manifest.SDKVersion === 3, "Marketplace plugin must use SDKVersion 3.");
  invariant(
    manifest.Software?.MinimumVersion === "7.1",
    "Node.js 24 plugin must require Stream Deck 7.1."
  );
  invariant(manifest.Nodejs?.Version === "24", "Manifest must select the Node.js 24 runtime.");
  invariant(
    JSON.stringify(manifest.OS) === JSON.stringify([{ Platform: "mac", MinimumVersion: "13" }]),
    "Supported OS matrix must be macOS 13 or newer."
  );
  invariant(
    pluginPackage.dependencies?.["@elgato/streamdeck"]?.startsWith("^3."),
    "The reviewed plugin bundle requires @elgato/streamdeck v3."
  );
  invariant(
    pluginPackage.engines?.node === ">=24",
    "Plugin package Node engine must match manifest Node.js 24."
  );
  invariant(
    rootPackage.engines?.node === ">=24.13.1 <25",
    "Root Node engine must stay within Node.js 24."
  );
  invariant(
    (await readFile(path.join(WORKSPACE_DIRECTORY, ".nvmrc"), "utf8")).trim() === "24.13.1",
    ".nvmrc must match the reviewed Node.js 24 minimum."
  );

  const workspaceVersions = new Map([
    ["root package", rootPackage.version],
    ["Stream Deck package", pluginPackage.version],
    ["protocol package", protocolPackage.version],
    ["Chrome package", chromePackage.version],
    ["Chrome manifest", chromeManifest.version]
  ]);
  for (const [label, version] of workspaceVersions) {
    invariant(
      version === rootPackage.version,
      `${label} version ${version} does not match ${rootPackage.version}.`
    );
  }
  invariant(
    manifest.Version === `${rootPackage.version}.0`,
    `Stream Deck version ${manifest.Version} does not match workspace version ${rootPackage.version}.`
  );
  invariant(
    pluginPackage.dependencies?.["@meet-deck/protocol"] === protocolPackage.version,
    "Stream Deck protocol dependency must match the protocol package version."
  );

  invariant(
    Array.isArray(manifest.Actions) && manifest.Actions.length === 4,
    "Meet Deck must expose four actions."
  );
  const manifestActionUuids = new Set(manifest.Actions.map((action) => action.UUID));
  invariant(
    manifestActionUuids.size === manifest.Actions.length,
    "Manifest action UUIDs must be unique."
  );
  assertSameValues(manifestActionUuids, EXPECTED_ACTIONS.keys(), "Published action UUIDs");
  for (const action of manifest.Actions) {
    const expectedAction = EXPECTED_ACTIONS.get(action.UUID);
    invariant(expectedAction, `Unexpected action UUID: ${action.UUID}`);
    invariant(action.Name === expectedAction.name, `${action.UUID} has an unexpected name.`);
    invariant(action.Icon === expectedAction.icon, `${action.UUID} has an unexpected icon path.`);
    invariant(
      JSON.stringify(action.States?.map((state) => state.Image) ?? []) ===
        JSON.stringify(expectedAction.states),
      `${action.UUID} state image order must remain ${JSON.stringify(expectedAction.states)}.`
    );
    invariant(
      action.UUID.startsWith(`${manifest.UUID}.`),
      `Action UUID is not prefixed by plugin UUID: ${action.UUID}`
    );
    invariant(
      JSON.stringify(action.Controllers) === JSON.stringify(["Keypad"]),
      `${action.UUID} must target Keypad only.`
    );
    invariant(
      action.DisableAutomaticStates === true,
      `${action.UUID} must use externally confirmed state.`
    );
    invariant(
      action.SupportedInMultiActions === false,
      `${action.UUID} must remain unavailable in multi-actions.`
    );
    invariant(
      action.SupportedInKeyLogicActions === false,
      `${action.UUID} must remain unavailable in key logic actions.`
    );
    invariant(action.States?.length === 2, `${action.UUID} must define two states.`);
  }

  const actionsSource = await readFile(
    path.join(WORKSPACE_DIRECTORY, "apps/streamdeck-plugin/src/actions.ts"),
    "utf8"
  );
  const runtimeActions = parseRuntimeActions(actionsSource);
  assertSameValues(runtimeActions.keys(), manifestActionUuids, "Runtime/manifest action UUIDs");
  for (const [uuid, expectedAction] of EXPECTED_ACTIONS) {
    const runtimeAction = runtimeActions.get(uuid);
    invariant(
      runtimeAction?.runtimeClass === expectedAction.runtimeClass &&
        runtimeAction.capability === expectedAction.capability,
      `${uuid} must map to ${expectedAction.runtimeClass}/${expectedAction.capability}.`
    );
  }
  invariant(
    actionsSource.includes("`imgs/status/${state.image}.svg`"),
    "Runtime status rendering must use the validated status image directory."
  );
  const runtimeStatusPaths = REQUIRED_STATUS_IMAGES;

  const propertyInspectorPath = await assertFile(manifest.PropertyInspectorPath);
  const propertyInspectorHtml = await readFile(propertyInspectorPath, "utf8");
  const propertyInspectorDependencies = new Set();
  const propertyInspectorLinks = new Set();
  const propertyInspectorAssets = new Set();
  for (const tagMatch of propertyInspectorHtml.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const tag = tagMatch[1].toLowerCase();
    const attributes = tagMatch[2];
    const urlAttributeTokens = [...attributes.matchAll(/(?:^|\s)(href|src)\s*=/gi)];
    const urlAttributes = [
      ...attributes.matchAll(/(?:^|\s)(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)
    ];
    invariant(
      urlAttributes.length === urlAttributeTokens.length,
      `Malformed URL attribute on property-inspector <${tag}> element.`
    );
    for (const attributeMatch of urlAttributes) {
      const attribute = attributeMatch[1].toLowerCase();
      const reference = attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4];
      if (/^[a-z]+:/i.test(reference) || reference.startsWith("//")) {
        invariant(
          tag === "a" && attribute === "href" && EXPECTED_PROPERTY_INSPECTOR_LINKS.has(reference),
          `Unexpected remote property-inspector reference: ${reference}`
        );
        propertyInspectorLinks.add(reference);
        continue;
      }
      const assetKey = `${tag}:${attribute}:${reference}`;
      invariant(
        EXPECTED_PROPERTY_INSPECTOR_ASSETS.has(assetKey),
        `Unexpected local property-inspector reference: ${assetKey}`
      );
      const resolved = path.posix.join(
        path.posix.dirname(manifest.PropertyInspectorPath),
        reference
      );
      await assertFile(resolved);
      propertyInspectorDependencies.add(resolved);
      propertyInspectorAssets.add(assetKey);
    }
  }
  assertSameValues(
    propertyInspectorLinks,
    EXPECTED_PROPERTY_INSPECTOR_LINKS,
    "Property-inspector help links"
  );
  assertSameValues(
    propertyInspectorAssets,
    EXPECTED_PROPERTY_INSPECTOR_ASSETS,
    "Property-inspector local assets"
  );
  invariant(
    !propertyInspectorHtml.includes('id="save-port"'),
    "Property-inspector settings must auto-save without a Save button."
  );
  const propertyInspectorScript = await readFile(
    safePluginPath("ui/property-inspector.js"),
    "utf8"
  );
  invariant(
    /elements\.port\.addEventListener\(\s*["']change["']/.test(propertyInspectorScript),
    "Loopback-port changes must auto-save from the property inspector."
  );
  invariant(
    propertyInspectorScript.includes('event: "openUrl"') &&
      propertyInspectorScript.includes("payload: { url: link.href }"),
    "Property-inspector help links must use Stream Deck's openUrl command."
  );
  for (const action of manifest.Actions) {
    invariant(
      (action.PropertyInspectorPath ?? manifest.PropertyInspectorPath) ===
        manifest.PropertyInspectorPath,
      `${action.UUID} property inspector must resolve to the shared inspector.`
    );
  }

  await assertFile(manifest.CodePath);
  const binPackage = await readJson(await assertFile("bin/package.json"));
  invariant(
    JSON.stringify(binPackage) === JSON.stringify({ type: "module" }),
    "bin/package.json must contain only the ESM module declaration."
  );
  invariant(
    (await stat(safePluginPath(manifest.CodePath))).size > 0,
    "Bundled plugin entry point is empty."
  );
  validateBundledActionMappings(await readFile(safePluginPath(manifest.CodePath), "utf8"));

  const monochromeHashes = new Set();
  monochromeHashes.add(await validatePngPair(manifest.CategoryIcon, 28, { monochrome: true }));
  await validatePngPair(manifest.Icon, 256);
  for (const action of manifest.Actions) {
    monochromeHashes.add(await validatePngPair(action.Icon, 20, { monochrome: true }));
    for (const state of action.States) {
      await validatePngPair(state.Image, 72);
    }
  }
  invariant(
    monochromeHashes.size === manifest.Actions.length + 1,
    "Category and action-list artwork must be visually distinct."
  );

  const sdignoreEntries = new Set(
    (await readFile(await assertFile(".sdignore"), "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  for (const entry of REQUIRED_SDIGNORE_ENTRIES) {
    invariant(sdignoreEntries.has(entry), `.sdignore is missing required entry: ${entry}`);
  }

  const expectedFiles = expectedBundleFiles(
    manifest,
    propertyInspectorDependencies,
    runtimeStatusPaths
  );
  const actualFiles = new Set(
    (await walkFiles(PLUGIN_DIRECTORY)).filter((relativePath) => !isSdIgnored(relativePath))
  );
  assertSameValues(actualFiles, expectedFiles, "Plugin source bundle files");

  console.log(
    `✔ Stream Deck bundle validated: ${manifest.Actions.length} actions, ${actualFiles.size} source files, ` +
      `${(manifest.Actions.length + 1) * 2} white-on-transparent action-list PNGs.`
  );
  return { expectedFiles, manifest };
}

function findEndOfCentralDirectory(buffer, label) {
  const minimumOffset = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      return offset;
    }
  }
  throw new Error(`${label} has no ZIP end-of-central-directory record.`);
}

function parseZip64Extra(extra, values, label) {
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const identifier = extra.readUInt16LE(offset);
    const length = extra.readUInt16LE(offset + 2);
    const dataStart = offset + 4;
    const dataEnd = dataStart + length;
    invariant(dataEnd <= extra.length, `${label} has a truncated ZIP extra field.`);
    if (identifier === 0x0001) {
      let valueOffset = dataStart;
      for (const key of ["uncompressedSize", "compressedSize", "localHeaderOffset"]) {
        if (values[key] === 0xffffffff) {
          invariant(valueOffset + 8 <= dataEnd, `${label} has incomplete ZIP64 metadata.`);
          const value = extra.readBigUInt64LE(valueOffset);
          invariant(
            value <= BigInt(Number.MAX_SAFE_INTEGER),
            `${label} ZIP64 ${key} is too large.`
          );
          values[key] = Number(value);
          valueOffset += 8;
        }
      }
      return;
    }
    offset = dataEnd;
  }
}

function readZipEntries(buffer, label) {
  const endOffset = findEndOfCentralDirectory(buffer, label);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  invariant(
    diskNumber === 0 && centralDirectoryDisk === 0 && entriesOnDisk === entryCount,
    `${label} must be a single-disk ZIP archive.`
  );
  invariant(entryCount !== 0xffff, `${label} uses an unsupported ZIP64 central-directory count.`);
  invariant(
    centralDirectoryOffset + centralDirectorySize === endOffset,
    `${label} has hidden data around its central directory.`
  );

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    invariant(
      offset + 46 <= centralDirectoryOffset + centralDirectorySize,
      `${label} has a truncated central-directory entry.`
    );
    invariant(
      buffer.readUInt32LE(offset) === 0x02014b50,
      `${label} has an invalid central-directory entry.`
    );
    const versionMadeBy = buffer.readUInt16LE(offset + 4);
    const versionNeeded = buffer.readUInt16LE(offset + 6);
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const rawCompressedSize = buffer.readUInt32LE(offset + 20);
    const rawUncompressedSize = buffer.readUInt32LE(offset + 24);
    const values = {
      compressedSize: rawCompressedSize,
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
      uncompressedSize: rawUncompressedSize
    };
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const nameStart = offset + 46;
    const extraStart = nameStart + nameLength;
    const entryEnd = extraStart + extraLength + commentLength;
    invariant(entryEnd <= buffer.length, `${label} has a truncated central-directory entry.`);
    const name = buffer.toString("utf8", nameStart, extraStart);
    parseZip64Extra(
      buffer.subarray(extraStart, extraStart + extraLength),
      values,
      `${label}:${name}`
    );
    invariant(diskStart === 0, `${label} entry ${name} must start on disk zero.`);
    invariant((flags & 1) === 0, `${label} must not contain encrypted entry ${name}.`);
    invariant(
      (flags & ~0x080e) === 0,
      `${label}:${name} uses unsupported ZIP flags 0x${flags.toString(16)}.`
    );
    invariant(method === 0 || method === 8, `${label} uses unsupported compression for ${name}.`);
    const usesZip64Sizes = rawCompressedSize === 0xffffffff || rawUncompressedSize === 0xffffffff;
    const minimumVersion = usesZip64Sizes ? 45 : method === 8 ? 20 : 10;
    invariant(
      versionNeeded >= minimumVersion && versionNeeded <= 45,
      `${label}:${name} requires unsupported or inconsistent ZIP version ${versionNeeded / 10}.`
    );
    const origin = versionMadeBy >>> 8;
    const unixMode = externalAttributes >>> 16;
    const unixType = unixMode & 0xf000;
    invariant(
      origin !== 3 || unixType === 0 || unixType === 0x8000,
      `${label} must contain only regular-file Unix entries: ${name}.`
    );
    invariant(
      (externalAttributes & 0x10) === 0,
      `${label} must not contain a DOS directory entry: ${name}.`
    );
    invariant(
      !name.startsWith("/") && !name.includes("\\"),
      `${label} contains unsafe path ${name}.`
    );
    invariant(
      !name
        .split("/")
        .some((segment) => segment === ".." || segment === "." || segment.length === 0),
      `${label} contains unsafe path ${name}.`
    );
    entries.push({ crc, flags, method, name, usesZip64Sizes, versionNeeded, ...values });
    offset = entryEnd;
  }
  invariant(
    offset === centralDirectoryOffset + centralDirectorySize,
    `${label} central-directory size mismatch.`
  );
  return { centralDirectoryOffset, entries };
}

function extractZipEntry(buffer, entry, label) {
  const offset = entry.localHeaderOffset;
  invariant(
    offset >= 0 && offset + 30 <= buffer.length,
    `${label}:${entry.name} is out of bounds.`
  );
  invariant(
    buffer.readUInt32LE(offset) === 0x04034b50,
    `${label}:${entry.name} has an invalid local header.`
  );
  const localVersionNeeded = buffer.readUInt16LE(offset + 4);
  const localFlags = buffer.readUInt16LE(offset + 6);
  const localMethod = buffer.readUInt16LE(offset + 8);
  const localCrc = buffer.readUInt32LE(offset + 14);
  const localCompressedSize = buffer.readUInt32LE(offset + 18);
  const localUncompressedSize = buffer.readUInt32LE(offset + 22);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  invariant(
    offset + 30 + nameLength + extraLength <= buffer.length,
    `${label}:${entry.name} has a truncated local header.`
  );
  const localName = buffer.toString("utf8", offset + 30, offset + 30 + nameLength);
  invariant(localName === entry.name, `${label}:${entry.name} local filename mismatch.`);
  invariant(
    localVersionNeeded === entry.versionNeeded,
    `${label}:${entry.name} local ZIP version mismatch.`
  );
  invariant(localFlags === entry.flags, `${label}:${entry.name} local flags mismatch.`);
  invariant(localMethod === entry.method, `${label}:${entry.name} local compression mismatch.`);
  if ((localFlags & 0x08) === 0) {
    invariant(localCrc === entry.crc, `${label}:${entry.name} local CRC mismatch.`);
    invariant(
      localCompressedSize === entry.compressedSize,
      `${label}:${entry.name} local compressed-size mismatch.`
    );
    invariant(
      localUncompressedSize === entry.uncompressedSize,
      `${label}:${entry.name} local uncompressed-size mismatch.`
    );
  } else {
    invariant(
      localCrc === 0 || localCrc === entry.crc,
      `${label}:${entry.name} invalid local CRC placeholder.`
    );
    invariant(
      localCompressedSize === 0 ||
        localCompressedSize === 0xffffffff ||
        localCompressedSize === entry.compressedSize,
      `${label}:${entry.name} invalid local compressed-size placeholder.`
    );
    invariant(
      localUncompressedSize === 0 ||
        localUncompressedSize === 0xffffffff ||
        localUncompressedSize === entry.uncompressedSize,
      `${label}:${entry.name} invalid local uncompressed-size placeholder.`
    );
  }
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  invariant(dataEnd <= buffer.length, `${label}:${entry.name} has truncated file data.`);
  const compressed = buffer.subarray(dataStart, dataEnd);
  const data = entry.method === 0 ? compressed : inflateRawSync(compressed);
  invariant(data.length === entry.uncompressedSize, `${label}:${entry.name} size mismatch.`);
  invariant(crc32(data) === entry.crc, `${label}:${entry.name} CRC mismatch.`);
  let endOffset = dataEnd;
  if ((localFlags & 0x08) !== 0) {
    const sizeWidth = entry.usesZip64Sizes ? 8 : 4;
    const descriptorLength = 4 + sizeWidth * 2;
    const descriptorOffsets = [dataEnd];
    if (dataEnd + 4 <= buffer.length && buffer.readUInt32LE(dataEnd) === 0x08074b50) {
      descriptorOffsets.unshift(dataEnd + 4);
    }
    const descriptorOffset = descriptorOffsets.find((candidate) => {
      if (candidate + descriptorLength > buffer.length) {
        return false;
      }
      const descriptorCrc = buffer.readUInt32LE(candidate);
      if (descriptorCrc !== entry.crc) {
        return false;
      }
      if (sizeWidth === 8) {
        return (
          buffer.readBigUInt64LE(candidate + 4) === BigInt(entry.compressedSize) &&
          buffer.readBigUInt64LE(candidate + 12) === BigInt(entry.uncompressedSize)
        );
      }
      return (
        buffer.readUInt32LE(candidate + 4) === entry.compressedSize &&
        buffer.readUInt32LE(candidate + 8) === entry.uncompressedSize
      );
    });
    invariant(descriptorOffset !== undefined, `${label}:${entry.name} data descriptor mismatch.`);
    endOffset = descriptorOffset + descriptorLength;
  }
  return { data, endOffset, startOffset: offset };
}

export async function validatePackedPlugin(artifactPath, sourceBundle) {
  const { expectedFiles, manifest } = sourceBundle ?? (await validateSourceBundle());
  const resolvedArtifact =
    artifactPath instanceof URL ? fileURLToPath(artifactPath) : path.resolve(artifactPath);
  const label = path.basename(resolvedArtifact);
  const archive = await readFile(resolvedArtifact);
  const { centralDirectoryOffset, entries } = readZipEntries(archive, label);
  const entryNames = new Set(entries.map((entry) => entry.name));
  invariant(entryNames.size === entries.length, `${label} contains duplicate ZIP paths.`);

  const packagedFiles = new Set(expectedFiles);
  packagedFiles.delete(".sdignore");
  const prefix = `${manifest.UUID}.sdPlugin/`;
  assertSameValues(
    entryNames,
    [...packagedFiles].map((relativePath) => `${prefix}${relativePath}`),
    "Packed plugin files"
  );

  const localSpans = [];
  for (const entry of entries) {
    const relativePath = entry.name.slice(prefix.length);
    const { data: packedData, endOffset, startOffset } = extractZipEntry(archive, entry, label);
    localSpans.push({ endOffset, name: entry.name, startOffset });
    const sourceData = await readFile(safePluginPath(relativePath));
    if (relativePath === "manifest.json") {
      invariant(
        JSON.stringify(JSON.parse(packedData.toString("utf8"))) ===
          JSON.stringify(JSON.parse(sourceData.toString("utf8"))),
        "Packed manifest does not match the source manifest."
      );
    } else {
      invariant(
        packedData.equals(sourceData),
        `Packed payload differs from source: ${relativePath}`
      );
    }
  }

  localSpans.sort((left, right) => left.startOffset - right.startOffset);
  let expectedOffset = 0;
  for (const span of localSpans) {
    invariant(
      span.startOffset === expectedOffset,
      `${label} has hidden, overlapping, or unindexed data before ${span.name}.`
    );
    expectedOffset = span.endOffset;
  }
  invariant(
    expectedOffset === centralDirectoryOffset,
    `${label} has hidden or unindexed data before its central directory.`
  );

  console.log(`✔ Packed plugin validated: ${entries.length} safe entries match the source bundle.`);
}

const isMainModule =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  if (process.argv[2] === "--artifact") {
    invariant(process.argv.length === 4, "Usage: validate-bundle.mjs --artifact <path>");
    await validatePackedPlugin(process.argv[3]);
  } else {
    invariant(process.argv.length === 2, "Usage: validate-bundle.mjs [--artifact <path>]");
    await validateSourceBundle();
  }
}
