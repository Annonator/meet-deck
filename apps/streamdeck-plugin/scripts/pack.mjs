import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";

const manifest = new URL("../dev.annonator.meet-deck.sdPlugin/manifest.json", import.meta.url);
const originalManifest = await readFile(manifest);
const executable = process.platform === "win32" ? "streamdeck.cmd" : "streamdeck";
const arguments_ = [
  "pack",
  "dev.annonator.meet-deck.sdPlugin",
  "--output",
  "../../artifacts",
  "--no-update-check",
  "--no-file-list",
  "--force"
];

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== null) {
        reject(new Error(`streamdeck pack terminated by ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`streamdeck pack exited with status ${exitCode}`);
  }
} finally {
  // Elgato CLI 1.8 rewrites manifest formatting while packing. Packaging must
  // never leave generated changes in the source tree, even on failure.
  await writeFile(manifest, originalManifest);
}
