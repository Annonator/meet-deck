import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const listingPath = path.join(repositoryRoot, "marketplace/listing.json");
const errors = [];
const results = [];

const [listing, rootPackage, chromePackage, chromeManifest, streamDeckManifest] = await Promise.all(
  [
    readJson(listingPath),
    readJson(path.join(repositoryRoot, "package.json")),
    readJson(path.join(repositoryRoot, "apps/chrome-extension/package.json")),
    readJson(path.join(repositoryRoot, "apps/chrome-extension/public/manifest.json")),
    readJson(
      path.join(
        repositoryRoot,
        "apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/manifest.json"
      )
    )
  ]
);
const chromeDefaultMessages = await readJson(
  path.join(
    repositoryRoot,
    `apps/chrome-extension/public/_locales/${chromeManifest.default_locale}/messages.json`
  )
);

validateListingCopy(
  listing,
  rootPackage,
  chromePackage,
  chromeManifest,
  chromeDefaultMessages,
  streamDeckManifest
);
const mediaFiles = await validateMedia(listing?.media);
await validateExportDirectory(listing?.media, mediaFiles);

if (errors.length > 0) {
  console.error(`Marketplace listing validation failed with ${errors.length} error(s):`);
  for (const error of [...errors].sort()) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Marketplace listing assets are valid.");
  for (const result of results) {
    console.log(`- ${result}`);
  }
}

function validateListingCopy(
  listing,
  rootPackage,
  chromePackage,
  chromeManifest,
  chromeDefaultMessages,
  streamDeckManifest
) {
  if (listing?.listingState !== "draft-not-submitted") {
    addError('listingState must be "draft-not-submitted" until an actual submission occurs.');
  }
  if (listing?.requirementsReviewedOn !== "2026-08-19") {
    addError("requirementsReviewedOn must record the date used to prepare this kit.");
  }
  if (!Array.isArray(listing?.requirementsSources) || listing.requirementsSources.length < 5) {
    addError("requirementsSources must include the official Elgato references used by the kit.");
  } else {
    for (const source of listing.requirementsSources) {
      requireHttpsUrl(source, "requirements source");
    }
  }

  const product = listing?.product;
  if (typeof product !== "object" || product === null) {
    addError("product must be an object.");
    return;
  }

  requireText(product.name, "product.name");
  const nameLength = codePointLength(product.name);
  if (nameLength > 30) {
    addError(`product.name is ${nameLength} characters; repository policy caps it at 30.`);
  }
  const chromeManifestName = resolveChromeManifestMessage(
    chromeManifest.name,
    chromeDefaultMessages
  );
  if (product.name !== streamDeckManifest.Name || product.name !== chromeManifestName) {
    addError("product.name must match the Stream Deck and Chrome manifest names.");
  }

  requireText(product.tagline, "product.tagline");
  const taglineLength = codePointLength(product.tagline);
  if (taglineLength > 60) {
    addError(
      `product.tagline is ${taglineLength} characters; repository media policy caps it at 60.`
    );
  }
  if (product.taglineUse !== "media-and-optional-marketing-only") {
    addError("product.taglineUse must make clear that Elgato documents no separate tagline field.");
  }

  if (product.author !== rootPackage.author || product.author !== chromePackage.author) {
    addError("product.author must match the root and Chrome package authors.");
  }
  if (product.author !== streamDeckManifest.Author || product.author !== chromeManifest.author) {
    addError("product.author must match the Stream Deck and Chrome manifest authors.");
  }
  if (product.uuid !== streamDeckManifest.UUID) {
    addError("product.uuid must match the Stream Deck manifest UUID.");
  }
  if (product.version !== rootPackage.version || product.version !== chromePackage.version) {
    addError("product.version must match the root and Chrome package versions.");
  }
  if (product.version !== chromeManifest.version) {
    addError("product.version must match the Chrome manifest version.");
  }
  if (product.streamDeckManifestVersion !== streamDeckManifest.Version) {
    addError("product.streamDeckManifestVersion must match the Stream Deck manifest version.");
  }
  if (product.releaseNotes?.version !== product.version) {
    addError("product.releaseNotes.version must match product.version.");
  }
  if (product.listingLanguage !== "en") {
    addError('product.listingLanguage must be "en" for the Marketplace submission.');
  }
  if (
    product.interfaceLanguages?.streamDeckPropertyInspector !== "en" ||
    JSON.stringify(product.interfaceLanguages?.chromeCompanion) !== '["en","de"]' ||
    JSON.stringify(product.interfaceLanguages?.supportedMeetControls) !== '["en","de"]'
  ) {
    addError("product.interfaceLanguages must disclose the current English and German surfaces.");
  }

  requireText(product.description, "product.description");
  const descriptionLength = codePointLength(product.description);
  if (descriptionLength < 250 || descriptionLength > 1500) {
    addError(`product.description is ${descriptionLength} characters; expected 250-1500.`);
  }
  const firstDescriptionCharacters = Array.from(product.description ?? "")
    .slice(0, 250)
    .join("");
  if (/[\r\n#*_•]/u.test(firstDescriptionCharacters)) {
    addError("The first 250 description characters must be unformatted plain text.");
  }
  if (!product.description.includes("Google Meet controls in English or German")) {
    addError("product.description must disclose the supported Google Meet control languages.");
  }

  validateNonemptyStringArray(product.features, "product.features", 4);
  validateNonemptyStringArray(product.setupInstructions, "product.setupInstructions", 4);
  validateNonemptyStringArray(product.limitations, "product.limitations", 3);
  validateNonemptyStringArray(product.reviewerInstructions, "product.reviewerInstructions", 5);

  const releaseNotesLength = codePointLength(product.releaseNotes?.text);
  requireText(product.releaseNotes?.text, "product.releaseNotes.text");
  if (releaseNotesLength < 1 || releaseNotesLength > 1500) {
    addError(`product.releaseNotes.text is ${releaseNotesLength} characters; expected 1-1500.`);
  }

  for (const linkName of ["repository", "support", "setup", "privacy"]) {
    requireHttpsUrl(product.links?.[linkName], `product.links.${linkName}`);
  }

  const requirements = product.requirements;
  const macRequirement = streamDeckManifest.OS?.find((entry) => entry.Platform === "mac");
  if (requirements?.macOSMinimum !== macRequirement?.MinimumVersion) {
    addError("product.requirements.macOSMinimum must match the Stream Deck manifest.");
  }
  if (requirements?.streamDeckMinimum !== streamDeckManifest.Software?.MinimumVersion) {
    addError("product.requirements.streamDeckMinimum must match the Stream Deck manifest.");
  }
  if (requirements?.chromeMinimum !== chromeManifest.minimum_chrome_version) {
    addError("product.requirements.chromeMinimum must match the Chrome manifest.");
  }
  if (requirements?.controller !== "Stream Deck with LCD keys") {
    addError('product.requirements.controller must be "Stream Deck with LCD keys".');
  }
  if (requirements?.companionChromeExtensionRequired !== true) {
    addError("product.requirements must disclose the required Chrome companion.");
  }
  if (JSON.stringify(requirements?.supportedMeetUiLanguages) !== '["en","de"]') {
    addError('product.requirements.supportedMeetUiLanguages must be ["en", "de"].');
  }

  const expectedActions = ["Microphone", "Camera", "Hand", "Presentation"];
  const actualActions = streamDeckManifest.Actions?.map((action) => action.Name);
  if (JSON.stringify(actualActions) !== JSON.stringify(expectedActions)) {
    addError(`Stream Deck actions changed; expected ${expectedActions.join(", ")}.`);
  }
  for (const action of expectedActions) {
    if (
      !product.description.includes(action) &&
      !product.description.includes(action.toLowerCase())
    ) {
      addError(`product.description must name the ${action} action.`);
    }
  }

  const allCopy = JSON.stringify(product);
  if (/available on (?:the )?marketplace/iu.test(allCopy) || /now available/iu.test(allCopy)) {
    addError("Listing copy must not claim Marketplace availability before publication.");
  }
  if (/\bencrypt(?:ed|ion)?\b/iu.test(allCopy)) {
    addError("Listing copy must describe the bridge as authenticated, not encrypted.");
  }
  if (/macOS 12(?:\+| or newer)/u.test(allCopy)) {
    addError("Listing copy must not advertise the superseded macOS 12 minimum.");
  }
  if (/Chrome Local Network Access|Sicher verbinden/u.test(allCopy)) {
    addError("Listing copy must use the current exact-host permission and pairing terminology.");
  }
  if (
    /companion (?:setup (?:screen|interface)|popup|screen) is (?:currently )?German/iu.test(allCopy)
  ) {
    addError("Listing copy must disclose that the Chrome companion supports English and German.");
  }
  if (
    typeof macRequirement?.MinimumVersion === "string" &&
    !product.description.includes(`macOS ${macRequirement.MinimumVersion} or newer`)
  ) {
    addError("product.description must state the manifest macOS minimum.");
  }
  if (
    typeof macRequirement?.MinimumVersion === "string" &&
    !product.reviewerInstructions?.[0]?.includes(`macOS ${macRequirement.MinimumVersion} or newer`)
  ) {
    addError("product.reviewerInstructions must state the manifest macOS minimum.");
  }
  if (
    typeof macRequirement?.MinimumVersion === "string" &&
    !product.releaseNotes?.text?.includes(`macOS ${macRequirement.MinimumVersion}+`)
  ) {
    addError("product.releaseNotes must state the manifest macOS minimum.");
  }

  results.push(
    `copy: name ${nameLength}/30, tagline ${taglineLength}/60 internal cap, description ${descriptionLength}/1500, release notes ${releaseNotesLength}/1500 characters`
  );
}

function resolveChromeManifestMessage(value, messages) {
  if (typeof value !== "string") {
    return value;
  }
  const match = /^__MSG_([A-Za-z0-9_]+)__$/.exec(value);
  return match === null ? value : messages?.[match[1]]?.message;
}

async function validateMedia(media) {
  if (typeof media !== "object" || media === null) {
    addError("media must be an object.");
    return [];
  }

  if (!Array.isArray(media.gallery) || media.gallery.length < 3 || media.gallery.length > 10) {
    addError("media.gallery must contain 3-10 items.");
  }

  const entries = [media.appIcon, media.thumbnail, ...(media.gallery ?? [])];
  const expected = [
    ["meet-deck-app-icon.png", 288, 288, 2000000, 20000],
    ["meet-deck-thumbnail.png", 1920, 960, 5000000, 100000],
    ["meet-deck-gallery-01-controls.png", 1920, 960, 10000000, 100000],
    ["meet-deck-gallery-02-pairing.png", 1920, 960, 10000000, 100000],
    ["meet-deck-gallery-03-privacy.png", 1920, 960, 10000000, 100000]
  ];

  if (entries.length !== expected.length) {
    addError(`Expected ${expected.length} static media entries, found ${entries.length}.`);
  }

  const validated = [];
  const hashes = new Set();
  for (const [index, entry] of entries.entries()) {
    const [fileName, width, height, maxBytes, minimumBytes] = expected[index] ?? [];
    if (typeof entry !== "object" || entry === null) {
      addError(`Static media entry ${index + 1} must be an object.`);
      continue;
    }
    if (path.basename(entry.path ?? "") !== fileName) {
      addError(`Static media entry ${index + 1} must use filename ${fileName}.`);
    }
    if (entry.width !== width || entry.height !== height || entry.maxBytes !== maxBytes) {
      addError(
        `Static media entry ${fileName} metadata must be ${width}x${height} and at most ${maxBytes} bytes.`
      );
    }
    if (entry.format !== "png") {
      addError(`Static media entry ${fileName} must declare PNG format.`);
    }
    requireText(entry.alt, `media alt text for ${fileName}`);

    const sourceReference = entry.source ?? "";
    const [sourceFile, query] = sourceReference.split("?");
    if (sourceFile !== "marketplace/assets/source/artboards.html" || !query?.startsWith("asset=")) {
      addError(`Static media entry ${fileName} must reference an editable artboard source.`);
    } else {
      await requireFile(path.join(repositoryRoot, sourceFile), `source for ${fileName}`);
    }

    const absolutePath = path.join(repositoryRoot, entry.path ?? "");
    try {
      const buffer = await readFile(absolutePath);
      const fileStats = await stat(absolutePath);
      if (fileStats.size > maxBytes) {
        addError(`${fileName} is ${fileStats.size} bytes; maximum is ${maxBytes}.`);
      }
      if (fileStats.size < minimumBytes) {
        addError(
          `${fileName} is only ${fileStats.size} bytes; expected at least ${minimumBytes} bytes for the reviewed non-blank artboard.`
        );
      }
      const png = inspectPng(buffer, fileName);
      if (png.width !== width || png.height !== height) {
        addError(`${fileName} is ${png.width}x${png.height}; expected ${width}x${height}.`);
      }
      const hash = createHash("sha256").update(buffer).digest("hex");
      if (hashes.has(hash)) {
        addError(`${fileName} duplicates another static media export.`);
      }
      hashes.add(hash);
      validated.push({ fileName, path: absolutePath });
      results.push(`${fileName}: PNG ${png.width}x${png.height}, ${fileStats.size} bytes`);
    } catch (error) {
      addError(`${fileName} could not be validated: ${error.message}`);
    }
  }

  await validateDemoVideo(media.demoVideo, validated);
  results.push(`gallery: ${media.gallery?.length ?? 0} PNG images`);
  return validated;
}

async function validateDemoVideo(video, validated) {
  if (typeof video !== "object" || video === null) {
    addError("media.demoVideo must be an object.");
    return;
  }
  if (
    video.width !== 1920 ||
    video.height !== 1080 ||
    video.format !== "mp4" ||
    video.maxBytes !== 50000000
  ) {
    addError("media.demoVideo must declare MP4 1920x1080 below 50,000,000 bytes.");
  }
  await requireFile(path.join(repositoryRoot, video.storyboard ?? ""), "demo video storyboard");
  requireText(video.reason, "media.demoVideo.reason");

  const absolutePath = path.join(repositoryRoot, video.path ?? "");
  let buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      addError(`Demo video could not be read: ${error.message}`);
    }
  }

  if (video.status === "capture-required") {
    if (buffer !== undefined) {
      addError("Demo video must be absent while media.demoVideo.status is capture-required.");
    } else {
      results.push("demo video: capture-required (MP4 correctly absent; storyboard present)");
    }
    return;
  }
  if (video.status !== "ready") {
    addError('media.demoVideo.status must be "capture-required" or "ready".');
    return;
  }
  if (buffer === undefined) {
    addError("Demo video status is ready, but the MP4 is absent.");
    return;
  }
  if (buffer.length >= video.maxBytes) {
    addError(`Demo video is ${buffer.length} bytes; it must be smaller than ${video.maxBytes}.`);
  }
  try {
    const dimensions = inspectMp4Dimensions(buffer);
    if (dimensions.width !== video.width || dimensions.height !== video.height) {
      addError(
        `Demo video is ${dimensions.width}x${dimensions.height}; expected ${video.width}x${video.height}.`
      );
    }
    validated.push({ fileName: path.basename(video.path), path: absolutePath });
    results.push(
      `${path.basename(video.path)}: MP4 ${dimensions.width}x${dimensions.height}, ${buffer.length} bytes`
    );
  } catch (error) {
    addError(`Demo video could not be validated: ${error.message}`);
  }
}

async function validateExportDirectory(media, mediaFiles) {
  const exportDirectory = path.join(repositoryRoot, "marketplace/assets/export");
  let directoryEntries;
  try {
    directoryEntries = await readdir(exportDirectory, { withFileTypes: true });
  } catch (error) {
    addError(`Could not read Marketplace export directory: ${error.message}`);
    return;
  }

  const expected = new Set(mediaFiles.map((entry) => entry.fileName));
  if (media?.demoVideo?.status === "ready") {
    expected.add(path.basename(media.demoVideo.path));
  }

  for (const entry of directoryEntries) {
    if (!entry.isFile() || !expected.has(entry.name)) {
      addError(`Unexpected Marketplace export entry: ${entry.name}.`);
    }
  }
  for (const fileName of expected) {
    if (!directoryEntries.some((entry) => entry.isFile() && entry.name === fileName)) {
      addError(`Missing Marketplace export: ${fileName}.`);
    }
  }
}

function inspectPng(buffer, label) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) {
    throw new Error("not a PNG file");
  }

  let offset = 8;
  let width;
  let height;
  let ihdrCount = 0;
  let idatCount = 0;
  let iendCount = 0;
  let animated = false;

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error("truncated PNG chunk header");
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > buffer.length) {
      throw new Error(`truncated ${type} chunk`);
    }

    const expectedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = crc32(buffer.subarray(offset + 4, dataEnd));
    if (expectedCrc !== actualCrc) {
      throw new Error(`${type} CRC mismatch`);
    }

    if (type === "IHDR") {
      ihdrCount += 1;
      if (length !== 13 || offset !== 8) {
        throw new Error("invalid IHDR chunk");
      }
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
    } else if (type === "IDAT") {
      idatCount += 1;
    } else if (type === "IEND") {
      iendCount += 1;
      if (length !== 0 || crcOffset + 4 !== buffer.length) {
        throw new Error("IEND must be the final empty chunk");
      }
    } else if (type === "acTL") {
      animated = true;
    }

    offset = crcOffset + 4;
  }

  if (ihdrCount !== 1 || idatCount < 1 || iendCount !== 1) {
    throw new Error(`${label} requires one IHDR, at least one IDAT, and one terminal IEND chunk`);
  }
  if (animated) {
    throw new Error("animated PNG is not allowed");
  }
  return { width, height };
}

function inspectMp4Dimensions(buffer) {
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") {
    throw new Error("not an ISO BMFF/MP4 file");
  }

  const videoSampleTypes = new Set(["avc1", "avc3", "hvc1", "hev1", "vp09", "av01"]);
  for (let typeOffset = 4; typeOffset + 32 <= buffer.length; typeOffset += 1) {
    const type = buffer.toString("ascii", typeOffset, typeOffset + 4);
    if (!videoSampleTypes.has(type) || typeOffset < 4) {
      continue;
    }
    const boxSize = buffer.readUInt32BE(typeOffset - 4);
    if (boxSize < 36 || typeOffset - 4 + boxSize > buffer.length) {
      continue;
    }
    const width = buffer.readUInt16BE(typeOffset + 28);
    const height = buffer.readUInt16BE(typeOffset + 30);
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  throw new Error("could not find a supported video sample entry with dimensions");
}

function validateNonemptyStringArray(value, label, minimumLength) {
  if (!Array.isArray(value) || value.length < minimumLength) {
    addError(`${label} must contain at least ${minimumLength} entries.`);
    return;
  }
  for (const [index, entry] of value.entries()) {
    requireText(entry, `${label}[${index}]`);
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    addError(`${label} must be nonempty text.`);
  }
}

function requireHttpsUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("not HTTPS");
    }
  } catch {
    addError(`${label} must be a valid HTTPS URL.`);
  }
}

async function requireFile(filePath, label) {
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      addError(`${label} must be a file.`);
    }
  } catch (error) {
    addError(`${label} is missing: ${error.message}`);
  }
}

function codePointLength(value) {
  return typeof value === "string" ? Array.from(value).length : 0;
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function addError(message) {
  errors.push(message);
}
