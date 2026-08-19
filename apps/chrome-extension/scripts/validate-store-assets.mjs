import { inflateSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { URL } from "node:url";

const assetRoot = new URL("../store/assets/", import.meta.url);
const listing = JSON.parse(
  await readFile(new URL("../store/listing.json", import.meta.url), "utf8")
);
const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")
);
const englishMessages = JSON.parse(
  await readFile(new URL("../public/_locales/en/messages.json", import.meta.url), "utf8")
);
const streamDeckManifest = JSON.parse(
  await readFile(
    new URL(
      "../../streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/manifest.json",
      import.meta.url
    ),
    "utf8"
  )
);

const expectedAssets = new Map([
  ["01-pair-locally.png", [1280, 800]],
  ["02-connected-controls.png", [1280, 800]],
  ["03-private-by-design.png", [1280, 800]],
  ["small-promo-440x280.png", [440, 280]]
]);

const actualAssets = (await readdir(assetRoot)).sort((left, right) =>
  left.localeCompare(right, "en")
);
assertEqual(actualAssets, [...expectedAssets.keys()].sort(), "store asset inventory");

for (const [name, [width, height]] of expectedAssets) {
  const png = parsePng(await readFile(new URL(name, assetRoot)), name);
  assert(png.width === width && png.height === height, `${name} must be ${width}x${height}`);
  assert(png.bitDepth === 8, `${name} must use 8-bit color`);
  assert([2, 6].includes(png.colorType), `${name} must be RGB or RGBA`);
  assert(png.interlace === 0, `${name} must be non-interlaced`);
}

const iconName = "dist/icons/icon-128.png";
const icon = parsePng(await readFile(new URL(`../${iconName}`, import.meta.url)), iconName);
assert(icon.width === 128 && icon.height === 128, "store icon must be 128x128");
assert(icon.bitDepth === 8 && icon.colorType === 6, "store icon must be 8-bit RGBA");
assert(icon.interlace === 0, "store icon must be non-interlaced");
assertEqual(
  alphaBounds(icon),
  { maxX: 111, maxY: 111, minX: 16, minY: 16 },
  "store icon 96x96 artwork safe area"
);

validateListing();
await validatePackageSeparation();

console.log(
  "Validated 1 promo tile (440x280), 3 screenshots (1280x800), the 128px icon safe area, listing metadata, and package separation"
);

function validateListing() {
  const details = listing.listing;
  const macRequirement = streamDeckManifest.OS?.find((entry) => entry.Platform === "mac");
  assertString(details.name, 1, 75, "listing name");
  assertString(details.summary, 1, 132, "listing summary");
  assertString(details.detailedDescription, 2, 16_000, "detailed description");
  assert(!/<[^>]+>/u.test(details.detailedDescription), "detailed description must be plain text");
  assert(details.category === "Communication", "category must be Communication");
  assert(details.defaultLocale === "en", "default locale must be en");
  assert(details.dashboardLanguage === "English", "dashboard language must be English");
  assert(details.matureContent === false, "mature-content answer must be false");
  validateHttpsUrl(details.homepageUrl, "homepage URL");
  validateHttpsUrl(details.supportUrl, "support URL");
  validateHttpsUrl(details.privacyPolicyUrl, "privacy-policy URL");
  assert(details.officialUrl === null, "official URL must remain null until a domain is verified");

  assert(details.name === englishMessages.app_name.message, "listing name must match en locale");
  assert(
    details.summary === englishMessages.app_description.message,
    "listing summary must match en locale"
  );
  assert(
    manifest.default_locale === details.defaultLocale,
    "manifest and listing locales must match"
  );
  assert(
    typeof macRequirement?.MinimumVersion === "string" &&
      details.detailedDescription.includes(`macOS ${macRequirement.MinimumVersion} or newer`),
    "detailed description must match the Stream Deck manifest macOS minimum"
  );
  assert(
    !/macOS 12(?:\+| or newer)/u.test(JSON.stringify(listing)),
    "store metadata must not advertise the superseded macOS 12 minimum"
  );

  assertString(listing.privacy.singlePurpose, 20, 1_000, "single-purpose statement");
  assert(listing.privacy.remoteCode.usesRemoteCode === false, "remote-code answer must be false");
  assertString(listing.privacy.remoteCode.justification, 20, 1_000, "remote-code justification");
  assertEqual(
    [...listing.privacy.dataUse.selected].sort(),
    ["Authentication information", "Website content"],
    "selected data-use types"
  );
  assert(
    listing.privacy.dataUse.notSelected.length === 7,
    "all other data-use types must be listed"
  );
  assert(
    listing.privacy.dataUse.soldOrTransferred === false &&
      listing.privacy.dataUse.usedForAdvertising === false &&
      listing.privacy.dataUse.usedForCreditworthiness === false &&
      listing.privacy.dataUse.humanReadableRemotely === false,
    "data-use answers must reflect local-only operation"
  );
  assert(
    Object.values(listing.privacy.limitedUseCertifications).every((answer) => answer === true),
    "all Limited Use certifications must be affirmed"
  );

  const expectedPermissionKeys = [
    "alarms",
    "https://meet.google.com/*",
    "storage",
    "ws://127.0.0.1/*"
  ];
  assertEqual(
    Object.keys(listing.permissionJustifications).sort(),
    expectedPermissionKeys,
    "permission justification inventory"
  );
  for (const [permission, justification] of Object.entries(listing.permissionJustifications)) {
    assertString(justification, 30, 2_000, `${permission} justification`);
  }
  assertEqual([...manifest.permissions].sort(), ["alarms", "storage"], "manifest permissions");
  assertEqual(
    manifest.optional_host_permissions,
    ["ws://127.0.0.1/*"],
    "manifest optional host permissions"
  );
  assertEqual(
    manifest.content_scripts.flatMap((entry) => entry.matches),
    ["https://meet.google.com/*"],
    "manifest content-script matches"
  );

  assert(listing.reviewer.companionPluginDownloadUrl === null, "plugin URL must not be invented");
  assertString(
    listing.reviewer.additionalInstructionsTemplate,
    50,
    500,
    "reviewer additional-instructions template"
  );
  assert(
    listing.reviewer.additionalInstructionsTemplate.includes("{COMPANION_PLUGIN_URL}"),
    "reviewer instructions must retain the plugin URL placeholder"
  );
  assert(
    listing.reviewer.additionalInstructionsTemplate.includes(
      `macOS ${macRequirement?.MinimumVersion}+`
    ),
    "reviewer instructions must match the Stream Deck manifest macOS minimum"
  );
  assert(listing.reviewer.fullProcedure.length >= 6, "reviewer procedure must cover the full flow");
  assert(listing.reviewer.testAccount === "None required", "reviewer test-account answer");
  assert(listing.reviewer.testCredentials === "None", "reviewer credentials answer");

  assert(
    listing.submissionReady === false,
    "submission must remain blocked until placeholders resolve"
  );
  assert(listing.remainingBeforeSubmission.length >= 4, "submission blockers must remain explicit");
  assert(
    listing.remainingBeforeSubmission.some((item) => item.includes(".streamDeckPlugin")),
    "submission blockers must include the companion plugin artifact"
  );
  assert(listing.media.smallPromoTile === "assets/small-promo-440x280.png", "promo path");
  assertEqual(
    listing.media.screenshots,
    [
      "assets/01-pair-locally.png",
      "assets/02-connected-controls.png",
      "assets/03-private-by-design.png"
    ],
    "screenshot paths"
  );
  assert(listing.media.storeIconInPackage === iconName, "store icon path");
}

async function validatePackageSeparation() {
  const forbidden = new Set(expectedAssets.keys());
  const files = await collectFiles(new URL("../dist/", import.meta.url));
  for (const file of files) {
    assert(
      !forbidden.has(file.split("/").at(-1)),
      `${file} must not be bundled in the extension ZIP`
    );
    assert(!file.startsWith("store/"), `${file} must not be bundled in the extension ZIP`);
  }
}

async function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(new URL(`${entry.name}/`, directory), `${relative}/`)));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

function parsePng(buffer, name) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.subarray(0, 8).equals(signature), `${name} must be a PNG`);
  let offset = 8;
  let header;
  const imageData = [];
  let ended = false;

  while (offset < buffer.length) {
    assert(offset + 12 <= buffer.length, `${name} has a truncated PNG chunk`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert(dataEnd + 4 <= buffer.length, `${name} has a truncated ${type} chunk`);
    const data = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    assert(actualCrc === expectedCrc, `${name} has an invalid ${type} CRC`);

    if (type === "IHDR") {
      assert(header === undefined && offset === 8 && length === 13, `${name} has an invalid IHDR`);
      header = {
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        height: data.readUInt32BE(4),
        interlace: data[12],
        width: data.readUInt32BE(0)
      };
    } else if (type === "IDAT") {
      imageData.push(data);
    } else if (["acTL", "fcTL", "fdAT"].includes(type)) {
      throw new Error(`${name} must not be animated`);
    } else if (type === "IEND") {
      assert(length === 0, `${name} has an invalid IEND`);
      ended = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }

  assert(header !== undefined, `${name} is missing IHDR`);
  assert(ended && offset === buffer.length, `${name} must end exactly after IEND`);
  assert(imageData.length > 0, `${name} is missing image data`);
  assert(header.compression === 0 && header.filter === 0, `${name} uses unsupported PNG settings`);
  return { ...header, imageData };
}

function alphaBounds(png) {
  assert(png.colorType === 6 && png.bitDepth === 8, "alpha scan requires 8-bit RGBA");
  const bytesPerPixel = 4;
  const stride = png.width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(png.imageData));
  assert(
    inflated.length === (stride + 1) * png.height,
    "store icon has an unexpected decompressed size"
  );
  let previous = Buffer.alloc(stride);
  let offset = 0;
  const bounds = { maxX: -1, maxY: -1, minX: png.width, minY: png.height };

  for (let y = 0; y < png.height; y += 1) {
    const filter = inflated[offset];
    offset += 1;
    const current = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const raw = inflated[offset + index];
      const left = index >= bytesPerPixel ? current[index - bytesPerPixel] : 0;
      const up = previous[index];
      const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
      current[index] = unfilter(raw, filter, left, up, upLeft);
    }
    offset += stride;

    for (let x = 0; x < png.width; x += 1) {
      if (current[x * bytesPerPixel + 3] === 0) {
        continue;
      }
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
    previous = current;
  }
  assert(bounds.maxX >= 0, "store icon must contain visible artwork");
  return bounds;
}

function unfilter(raw, filter, left, up, upLeft) {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonalDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonalDistance) {
    return left;
  }
  return upDistance <= diagonalDistance ? up : upLeft;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateHttpsUrl(value, label) {
  const url = new URL(value);
  assert(url.protocol === "https:", `${label} must use HTTPS`);
  assert(url.username === "" && url.password === "", `${label} must not contain credentials`);
}

function assertString(value, min, max, label) {
  assert(typeof value === "string", `${label} must be text`);
  assert(value.length >= min && value.length <= max, `${label} must be ${min}-${max} characters`);
}

function assertEqual(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} does not match`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
