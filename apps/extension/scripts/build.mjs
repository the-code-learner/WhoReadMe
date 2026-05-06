import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "src/manifest.json"), resolve(dist, "manifest.json"));
await esbuild.build({
  entryPoints: {
    content: resolve(root, "src/content.ts"),
    background: resolve(root, "src/background.ts"),
    popup: resolve(root, "src/popup.ts")
  },
  bundle: true,
  format: "esm",
  outdir: dist,
  sourcemap: true,
  target: "chrome124"
});
await cp(resolve(root, "src/popup.html"), resolve(dist, "popup.html"));
await cp(resolve(root, "src/popup.css"), resolve(dist, "popup.css"));

