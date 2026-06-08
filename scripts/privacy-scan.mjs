import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".zip"
]);
const allowedEmailDomains = new Set([
  "example.com",
  "example.invalid",
  "example.net",
  "example.org"
]);
const absolutePathPatterns = [
  new RegExp("\\b[A-Za-z]:[\\\\/][^\\s\"'`]+", "g"),
  new RegExp("(^|[\\s\"'`])/(Users|home)/[^\\s\"'`]+", "g")
];
const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const issues = [];

for (const file of files) {
  if (binaryExtensions.has(file.slice(file.lastIndexOf(".")).toLowerCase())) continue;
  const content = readFileSync(file, "utf8");
  for (const pattern of absolutePathPatterns) {
    for (const match of content.matchAll(pattern)) {
      issues.push(`${file}: possible local absolute path: ${match[0].trim()}`);
    }
  }
  for (const match of content.matchAll(emailPattern)) {
    const domain = match[1].toLowerCase();
    if (!allowedEmailDomains.has(domain)) {
      issues.push(`${file}: possible personal email address: ${match[0]}`);
    }
  }
}

if (issues.length) {
  console.error("Privacy scan failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("Privacy scan passed.");
