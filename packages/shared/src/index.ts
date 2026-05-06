export type TrackingEventType = "open" | "click";

export interface RecipientReadSummary {
  recipientId: string;
  email: string;
  displayName?: string;
  openCount: number;
  clickCount: number;
  lastOpenedAt?: string;
  lastClickedAt?: string;
}

export interface MessageReadSummary {
  messageId: string;
  subject?: string;
  totalOpens: number;
  totalClicks: number;
  recipients: RecipientReadSummary[];
}

export interface TrackerFinding {
  type: "tracking-pixel" | "redirect-link" | "suspicious-image";
  value: string;
  reason: string;
}

export interface TrackerDetectionResult {
  riskLevel: "none" | "low" | "medium" | "high";
  findings: TrackerFinding[];
}

export interface PrepareMessageRequest {
  subject?: string;
  senderEmail: string;
  gmailDraftId?: string;
  recipients: Array<{ email: string; displayName?: string }>;
  links: string[];
}

export interface PrepareMessageResponse {
  messageId: string;
  recipients: Array<{ id: string; email: string; displayName?: string; pixelUrl: string }>;
  links: Array<{ id: string; originalUrl: string; trackedUrl: string }>;
}

const encoder = new TextEncoder();

export function createId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${value}`;
}

export async function hmacSign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

export async function verifyHmac(secret: string, value: string, signature: string): Promise<boolean> {
  const expected = await hmacSign(secret, value);
  return timingSafeEqual(expected, signature);
}

export async function signedQuery(secret: string, params: Record<string, string>): Promise<URLSearchParams> {
  const search = new URLSearchParams(params);
  const payload = canonicalQuery(search);
  search.set("sig", await hmacSign(secret, payload));
  return search;
}

export async function verifySignedQuery(secret: string, search: URLSearchParams): Promise<boolean> {
  const signature = search.get("sig");
  if (!signature) return false;
  const copy = new URLSearchParams(search);
  copy.delete("sig");
  return verifyHmac(secret, canonicalQuery(copy), signature);
}

export function canonicalQuery(search: URLSearchParams): string {
  return Array.from(search.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function detectTrackers(html: string): TrackerDetectionResult {
  const findings: TrackerFinding[] = [];
  const imageMatches = html.matchAll(/<img\b[^>]*>/gi);
  for (const [tag] of imageMatches) {
    const src = getAttribute(tag, "src");
    const width = getAttribute(tag, "width");
    const height = getAttribute(tag, "height");
    const style = getAttribute(tag, "style");
    const hiddenBySize = width === "1" || height === "1" || /width\s*:\s*1px|height\s*:\s*1px|display\s*:\s*none/i.test(style ?? "");
    const suspiciousUrl = /track|open|pixel|beacon|analytics|mailgun|sendgrid|mandrill|hubspot|mailchimp/i.test(src ?? "");
    if (src && (hiddenBySize || suspiciousUrl)) {
      findings.push({
        type: hiddenBySize ? "tracking-pixel" : "suspicious-image",
        value: src,
        reason: hiddenBySize ? "Hidden or 1x1 image can be used as an open tracker." : "Image URL contains common tracking terms."
      });
    }
  }

  const linkMatches = html.matchAll(/<a\b[^>]*>/gi);
  for (const [tag] of linkMatches) {
    const href = getAttribute(tag, "href");
    if (href && /click|redirect|trk|utm_|mailchi\.mp|sendgrid|hubspot|mandrill/i.test(href)) {
      findings.push({
        type: "redirect-link",
        value: href,
        reason: "Link URL looks like a redirect or analytics tracking endpoint."
      });
    }
  }

  return {
    riskLevel: findings.length >= 5 ? "high" : findings.length >= 2 ? "medium" : findings.length === 1 ? "low" : "none",
    findings
  };
}

function getAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1];
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

