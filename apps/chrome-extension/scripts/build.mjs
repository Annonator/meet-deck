import { rm } from "node:fs/promises";
import { fileURLToPath, URL } from "node:url";

import { rollup } from "rollup";

import configs from "../rollup.config.mjs";

const outputRoot = fileURLToPath(new URL("../dist/", import.meta.url));

await rm(outputRoot, { recursive: true, force: true });

for (const config of configs) {
  const bundle = await rollup(config);
  await bundle.write(config.output);
  await bundle.close();
}
