import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = Boolean(process.env.ROLLUP_WATCH);
const sdPlugin = "dev.annonator.meet-deck.sdPlugin";

/** @type {import("rollup").RollupOptions} */
export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "es",
    inlineDynamicImports: true,
    sourcemap: isWatching,
    sourcemapPathTransform(relativeSourcePath, sourcemapPath) {
      return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
    }
  },
  plugins: [
    {
      name: "watch-plugin-resources",
      buildStart() {
        this.addWatchFile(`${sdPlugin}/manifest.json`);
        this.addWatchFile(`${sdPlugin}/ui/property-inspector.html`);
        this.addWatchFile(`${sdPlugin}/ui/property-inspector.js`);
        this.addWatchFile(`${sdPlugin}/ui/property-inspector.css`);
      }
    },
    typescript({
      tsconfig: "./tsconfig.json",
      mapRoot: isWatching ? "./" : undefined
    }),
    nodeResolve({
      browser: false,
      exportConditions: ["node"],
      preferBuiltins: true
    }),
    commonjs(),
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({
          fileName: "package.json",
          source: '{"type":"module"}\n',
          type: "asset"
        });
      }
    }
  ]
};
