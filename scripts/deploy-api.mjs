import { spawn } from "node:child_process";
import { withApiWranglerConfig } from "./api-wrangler-config.mjs";

await withApiWranglerConfig((configPath) => runWrangler(["deploy", "--config", configPath, "--keep-vars"]));

function runWrangler(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["wrangler", ...args], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
