import { cp, mkdir, readdir } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

import { generateIcons } from "./scripts/generate-icons.mjs";

const appRoot = fileURLToPath(new URL("./", import.meta.url));
const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));
const outputRoot = fileURLToPath(new URL("./dist/", import.meta.url));

function copyPublicFiles() {
  return {
    name: "meet-deck-copy-public",
    async buildStart() {
      for (const file of await listFiles(publicRoot)) {
        this.addWatchFile(file);
      }
      await mkdir(outputRoot, { recursive: true });
      await cp(publicRoot, outputRoot, { recursive: true, force: true });
      await generateIcons(outputRoot);
    }
  };
}

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(`${absolute}/`)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function createConfig(input, output, extraPlugins = []) {
  return {
    input: `${appRoot}${input}`,
    output: {
      file: `${outputRoot}${output}`,
      format: "iife",
      sourcemap: Boolean(process.env.ROLLUP_WATCH)
    },
    plugins: [
      ...extraPlugins,
      nodeResolve({ browser: true }),
      typescript({
        noEmitOnError: true,
        sourceMap: Boolean(process.env.ROLLUP_WATCH),
        tsconfig: `${appRoot}tsconfig.json`
      })
    ],
    treeshake: {
      moduleSideEffects: false
    }
  };
}

export default [
  createConfig("src/service-worker.ts", "service-worker.js", [copyPublicFiles()]),
  createConfig("src/content-script.ts", "content-script.js"),
  createConfig("src/popup.ts", "popup.js"),
  createConfig("src/onboarding.ts", "onboarding.js")
];
