// Bundles the extension host code and the two webviews with esbuild.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: "info",
};

const builds = [
  {
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    platform: "node",
    format: "cjs",
    target: "node18",
    external: ["vscode"],
  },
  {
    ...shared,
    entryPoints: {
      sidebar: "src/webview/sidebar/main.ts",
      panel: "src/webview/panel/main.ts",
    },
    outdir: "dist/webview",
    platform: "browser",
    format: "iife",
    target: "es2022",
    loader: { ".css": "css", ".woff2": "file" },
    assetNames: "fonts/[name]",
  },
];

if (watch) {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
