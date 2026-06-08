import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = resolve(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "src"), dist, { recursive: true });

const apiOrigin = process.env.API_ORIGIN || "http://localhost:8787";
await writeFile(
  resolve(dist, "config.js"),
  `window.WRM_CONFIG = ${JSON.stringify({ apiOrigin })};\n`
);
