import { glob, readFile } from "node:fs/promises";
import path from "node:path";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const currentPackage = await readJson("package.json");
const tag = process.argv[2] ?? `v${String(currentPackage.version)}`;
const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag ?? "");

if (match === null) {
  throw new Error(
    `Release tag must be stable SemVer in the form vX.Y.Z; received ${tag ?? "none"}`
  );
}

const version = match[1];
const versionComponents = version.split(".").map(Number);
if (versionComponents.every((component) => component === 0)) {
  throw new Error("Chrome release versions cannot be all zero.");
}
if (versionComponents.some((component) => component > 65_535)) {
  throw new Error("Chrome release version components cannot exceed 65535.");
}

if (!Array.isArray(currentPackage.workspaces) || currentPackage.workspaces.length === 0) {
  throw new Error("package.json must declare at least one workspace pattern.");
}
const workspacePackagePaths = [];
for await (const packagePath of glob(
  currentPackage.workspaces.map((workspace) => `${workspace}/package.json`)
)) {
  workspacePackagePaths.push(packagePath);
}
if (workspacePackagePaths.length === 0) {
  throw new Error("The workspace patterns did not match any package.json files.");
}
workspacePackagePaths.sort();
const workspacePaths = workspacePackagePaths.map((packagePath) => path.dirname(packagePath));
const packages = new Map([
  ["package.json", currentPackage],
  ...(await Promise.all(
    workspacePackagePaths.map(async (packagePath) => [packagePath, await readJson(packagePath)])
  ))
]);

for (const [path, packageJson] of packages) {
  assertVersion(`${path} version`, packageJson.version, version);
}

for (const [packagePath, packageJson] of packages) {
  if (Object.hasOwn(packageJson.dependencies ?? {}, "@meet-deck/protocol")) {
    assertVersion(
      `${packagePath} @meet-deck/protocol dependency`,
      packageJson.dependencies["@meet-deck/protocol"],
      version
    );
  }
}

const lockfile = await readJson("package-lock.json");
assertVersion("package-lock.json version", lockfile.version, version);
for (const path of ["", ...workspacePaths]) {
  const label = path === "" ? "root" : path;
  assertVersion(`package-lock.json ${label} version`, lockfile.packages?.[path]?.version, version);
}
for (const workspacePath of workspacePaths) {
  const dependencies = lockfile.packages?.[workspacePath]?.dependencies ?? {};
  if (Object.hasOwn(dependencies, "@meet-deck/protocol")) {
    assertVersion(
      `package-lock.json ${workspacePath} @meet-deck/protocol dependency`,
      dependencies["@meet-deck/protocol"],
      version
    );
  }
}

const chromeManifest = await readJson("apps/chrome-extension/public/manifest.json");
assertVersion("Chrome manifest version", chromeManifest.version, version);
if (JSON.stringify(chromeManifest.permissions) !== '["storage","alarms"]') {
  throw new Error(`Unexpected Chrome permissions: ${JSON.stringify(chromeManifest.permissions)}`);
}

const pluginManifest = await readJson(
  "apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/manifest.json"
);
assertVersion("Stream Deck manifest version", pluginManifest.Version, `${version}.0`);

console.log(`Release metadata matches ${tag}.`);

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} is ${String(actual)}; expected ${expected}`);
  }
}
