import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const artifactRoot = path.join(repositoryRoot, "artifacts");
const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));

if (typeof rootPackage.version !== "string" || !/^\d+\.\d+\.\d+$/.test(rootPackage.version)) {
  throw new Error("package.json must contain a three-component numeric version.");
}

const artifactNames = [
  "dev.annonator.meet-deck.streamDeckPlugin",
  `meet-deck-chrome-v${rootPackage.version}.zip`
];

await mkdir(artifactRoot, { recursive: true });

const lines = [];
for (const artifactName of artifactNames) {
  const bytes = await readFile(path.join(artifactRoot, artifactName));
  const digest = createHash("sha256").update(bytes).digest("hex");
  lines.push(`${digest}  ${artifactName}`);
}

await writeFile(path.join(artifactRoot, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
