import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function withApiWranglerConfig(callback) {
  const env = readDeployEnv();
  const dir = await mkdtemp(join(tmpdir(), "wrm-api-"));
  const configPath = join(dir, "wrangler.toml");
  try {
    await writeFile(configPath, apiWranglerConfig(env));
    return await callback(configPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function readDeployEnv() {
  const values = {
    d1DatabaseId: process.env.WRM_D1_DATABASE_ID,
    appOrigin: process.env.WRM_APP_ORIGIN,
    apiOrigin: process.env.WRM_API_ORIGIN
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing deployment environment: ${missing.join(", ")}`);
  }
  return values;
}

function apiWranglerConfig(env) {
  const main = resolve(root, "apps/api/src/index.ts").replaceAll("\\", "/");
  const migrations = resolve(root, "apps/api/migrations").replaceAll("\\", "/");
  return `name = "who-read-me-api"
main = "${main}"
compatibility_date = "2026-04-23"

[vars]
APP_ORIGIN = "${escapeToml(env.appOrigin)}"
API_ORIGIN = "${escapeToml(env.apiOrigin)}"

[[d1_databases]]
binding = "DB"
database_name = "who-read-me"
database_id = "${escapeToml(env.d1DatabaseId)}"
migrations_dir = "${migrations}"

[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "who-read-me-artifacts"

[[queues.producers]]
binding = "EVENT_QUEUE"
queue = "who-read-me-events"

[[queues.consumers]]
queue = "who-read-me-events"
max_batch_size = 10
max_batch_timeout = 5

[[send_email]]
name = "AUTH_EMAIL"

[ai]
binding = "AI"

[triggers]
crons = ["17 3 * * *"]
`;
}

function escapeToml(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
