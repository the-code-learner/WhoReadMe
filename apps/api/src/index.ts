import {
  createId,
  classifyEventActor,
  detectTrackers,
  type DashboardStats,
  type ExtensionPairing,
  type MessageReadSummary,
  type MessageListItem,
  type ProductSettings,
  type PrepareMessageRequest,
  type PrepareMessageResponse,
  type SendTrackedEmailRequest,
  type SendTrackedEmailResponse,
  hmacSign,
  signedQuery,
  verifyHmac,
  verifySignedQuery
} from "@who-read-me/shared";

interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  EVENT_QUEUE: Queue<QueuedTrackingEvent>;
  AI: Ai;
  APP_ORIGIN: string;
  API_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

interface QueuedTrackingEvent {
  eventId: string;
  eventType: "open" | "click";
  messageId: string;
  recipientId?: string;
  linkId?: string;
  userAgent?: string;
  referrer?: string;
  country?: string;
  colo?: string;
  isBot: boolean;
  confidence: "low" | "medium" | "high";
  reason: string;
}

interface AuthContext {
  user: { id: string; email: string; name?: string };
  kind: "cookie" | "extension";
  csrfToken?: string;
}

const pixel = Uint8Array.from([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return withSecurityHeaders(cors(null, env));
    if (url.pathname === "/health") return withSecurityHeaders(json({ ok: true }, env));
    if (url.pathname === "/auth/google/start") return startGoogleAuth(url, env);
    if (url.pathname === "/auth/google/callback") return finishGoogleAuth(request, env);
    if (url.pathname === "/auth/logout") return logout(env);
    if (url.pathname === "/track/open.gif") return trackOpen(request, env);
    if (url.pathname === "/track/click") return trackClick(request, env);

    const auth = await authenticate(request, env);
    if (!auth) return json({ error: "Authentication required" }, env, 401);
    if (!await authorizeMutation(request, env, auth)) return json({ error: "Invalid CSRF token" }, env, 403);

    if (url.pathname === "/api/me") return json({ user: auth.user, csrfToken: auth.csrfToken }, env);
    if (url.pathname === "/api/dashboard/stats") return dashboardStats(env, auth.user.id);
    if (url.pathname === "/api/messages") return listMessages(env, auth.user.id);
    if (url.pathname === "/api/events") return listEvents(url, env, auth.user.id);
    if (url.pathname === "/api/export/events.csv") return exportEventsCsv(env, auth.user.id);
    if (url.pathname === "/api/settings" && request.method === "GET") return getSettings(env);
    if (url.pathname === "/api/settings" && request.method === "POST") return updateSettings(request, env);
    if (url.pathname === "/api/extension/pair" && request.method === "POST") return pairExtension(request, env, auth.user.id);
    if (url.pathname === "/api/extension/pairings") return listPairings(env, auth.user.id);
    if (url.pathname.startsWith("/api/extension/pairings/") && request.method === "DELETE") return revokePairing(url, env, auth.user.id);
    if (url.pathname === "/api/messages/prepare" && request.method === "POST") return prepareMessage(request, env, auth.user.id);
    if (url.pathname === "/api/gmail/send-tracked" && request.method === "POST") return sendTrackedEmail(request, env, auth.user.id);
    if (url.pathname.startsWith("/api/messages/") && url.pathname.endsWith("/summary")) return messageSummary(url, env, auth.user.id);
    if (url.pathname === "/api/detect" && request.method === "POST") return detectReceivedTrackers(request, env, auth.user.id);

    return json({ error: "Not found" }, env, 404);
  },

  async queue(batch: MessageBatch<QueuedTrackingEvent>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await persistTrackingEvent(message.body, env);
      message.ack();
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await applyRetention(env);
  }
};

async function startGoogleAuth(url: URL, env: Env): Promise<Response> {
  const state = await signedQuery(env.SESSION_SECRET, {
    nonce: createId("state"),
    next: url.searchParams.get("next") ?? env.APP_ORIGIN
  });
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.API_ORIGIN}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
    state: state.toString(),
    access_type: "offline",
    prompt: "consent"
  }).toString();
  return Response.redirect(authUrl.toString(), 302);
}

async function finishGoogleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = new URLSearchParams(url.searchParams.get("state") ?? "");
  if (!(await verifySignedQuery(env.SESSION_SECRET, state))) return json({ error: "Invalid OAuth state" }, env, 400);

  const code = url.searchParams.get("code");
  if (!code) return json({ error: "Missing OAuth code" }, env, 400);

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${env.API_ORIGIN}/auth/google/callback`
    })
  });
  if (!tokenResponse.ok) return json({ error: "Google token exchange failed" }, env, 502);
  const token = await tokenResponse.json<{ id_token: string; refresh_token?: string }>();
  const profile = parseJwt<{ sub: string; email: string; name?: string; picture?: string }>(token.id_token);

  const existingOwner = await env.DB.prepare("SELECT id, google_sub FROM users WHERE role = 'owner' LIMIT 1").first<{ id: string; google_sub: string }>();
  if (existingOwner && existingOwner.google_sub !== profile.sub) return json({ error: "This deployment already has an owner" }, env, 403);

  const userId = existingOwner?.id ?? createId("usr");
  await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, avatar_url, gmail_refresh_token, role)
    VALUES (?, ?, ?, ?, ?, ?, 'owner')
    ON CONFLICT(google_sub) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      avatar_url = excluded.avatar_url,
      gmail_refresh_token = COALESCE(excluded.gmail_refresh_token, users.gmail_refresh_token),
      updated_at = CURRENT_TIMESTAMP`
  ).bind(userId, profile.sub, profile.email, profile.name ?? null, profile.picture ?? null, token.refresh_token ? await encryptSecret(env, token.refresh_token) : null).run();

  const sessionId = createId("ses");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").bind(sessionId, userId, expiresAt).run();
  const sessionSig = await signSession(env, sessionId);
  const next = state.get("next") ?? env.APP_ORIGIN;
  return new Response(null, {
    status: 302,
    headers: {
      location: next,
      "set-cookie": cookie("wrm_session", `${sessionId}.${sessionSig}`, { maxAge: 60 * 60 * 24 * 30 }),
      ...corsHeaders(env)
    }
  });
}

async function pairExtension(request: Request, env: Env, userId: string): Promise<Response> {
  const body = await request.json<{ label?: string }>().catch((): { label?: string } => ({}));
  const token = createId("ext");
  const tokenHash = await cryptoHash(token);
  await env.DB.prepare("INSERT INTO extension_pairings (id, user_id, token_hash, label) VALUES (?, ?, ?, ?)")
    .bind(createId("pair"), userId, tokenHash, body.label ?? "Chrome Extension")
    .run();
  return json({ token, apiOrigin: env.API_ORIGIN }, env);
}

async function prepareMessage(request: Request, env: Env, userId: string): Promise<Response> {
  const body = await request.json<PrepareMessageRequest>();
  const messageId = createId("msg");
  await env.DB.prepare("INSERT INTO messages (id, user_id, gmail_message_id, subject, sender_email) VALUES (?, ?, ?, ?, ?)")
    .bind(messageId, userId, body.gmailDraftId ?? null, body.subject ?? null, body.senderEmail)
    .run();

  const recipients: PrepareMessageResponse["recipients"] = [];
  for (const recipient of body.recipients) {
    const recipientId = createId("rec");
    await env.DB.prepare("INSERT INTO recipients (id, message_id, email, display_name) VALUES (?, ?, ?, ?)")
      .bind(recipientId, messageId, recipient.email, recipient.displayName ?? null)
      .run();
    const query = await signedQuery(env.SESSION_SECRET, { messageId, recipientId });
    recipients.push({ id: recipientId, email: recipient.email, displayName: recipient.displayName, pixelUrl: `${env.API_ORIGIN}/track/open.gif?${query}` });
  }

  const links: PrepareMessageResponse["links"] = [];
  for (const originalUrl of body.links) {
    const linkId = createId("lnk");
    await env.DB.prepare("INSERT INTO tracked_links (id, message_id, original_url) VALUES (?, ?, ?)")
      .bind(linkId, messageId, originalUrl)
      .run();
    const query = await signedQuery(env.SESSION_SECRET, { messageId, linkId, url: originalUrl });
    links.push({ id: linkId, originalUrl, trackedUrl: `${env.API_ORIGIN}/track/click?${query}` });
  }

  return json({ messageId, recipients, links }, env);
}

async function sendTrackedEmail(request: Request, env: Env, userId: string): Promise<Response> {
  const body = await request.json<SendTrackedEmailRequest>();
  if (!body.recipients.length) return json({ error: "At least one recipient is required" }, env, 400);
  if (!body.html.trim()) return json({ error: "Email body is required" }, env, 400);

  const accessToken = await getGmailAccessToken(env, userId);
  if (!accessToken) return json({ error: "Gmail is not linked. Sign in again with Google consent." }, env, 409);

  const sent: SendTrackedEmailResponse["sent"] = [];
  for (const recipient of body.recipients) {
    const messageId = createId("msg");
    const recipientId = createId("rec");
    await env.DB.prepare(
      "INSERT INTO messages (id, user_id, client_compose_id, subject, sender_email, status) VALUES (?, ?, ?, ?, ?, 'sending')"
    ).bind(messageId, userId, body.clientComposeId, body.subject ?? null, body.senderEmail).run();
    await env.DB.prepare("INSERT INTO recipients (id, message_id, email, display_name) VALUES (?, ?, ?, ?)")
      .bind(recipientId, messageId, recipient.email, recipient.displayName ?? null)
      .run();

    const html = await buildTrackedHtml(body.html, env, messageId, recipientId);
    const raw = createMimeMessage({
      from: body.senderEmail,
      to: recipient.email,
      subject: body.subject ?? "",
      html,
      text: body.text ?? stripHtml(html)
    });
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ raw })
    });
    if (!gmailResponse.ok) {
      await env.DB.prepare("UPDATE messages SET status = 'failed' WHERE id = ?").bind(messageId).run();
      const error = await gmailResponse.text();
      return json({ error: "Gmail send failed", detail: error }, env, 502);
    }
    const gmailMessage = await gmailResponse.json<{ id?: string }>();
    await env.DB.prepare("UPDATE messages SET status = 'sent', gmail_message_id = ? WHERE id = ?")
      .bind(gmailMessage.id ?? null, messageId)
      .run();
    sent.push({ messageId, gmailMessageId: gmailMessage.id, recipient: { id: recipientId, ...recipient } });
  }

  return json({ sent }, env);
}

async function trackOpen(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!await allowRate(request, env, "open", 120)) return new Response(pixel, { headers: pixelHeaders() });
  if (await verifySignedQuery(env.SESSION_SECRET, url.searchParams)) {
    await enqueueEvent(request, env, {
      eventId: createId("evt"),
      eventType: "open",
      messageId: required(url, "messageId"),
      recipientId: required(url, "recipientId")
    });
  }
  return new Response(pixel, {
    headers: pixelHeaders()
  });
}

async function trackClick(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!await allowRate(request, env, "click", 60)) return json({ error: "Rate limit exceeded" }, env, 429);
  if (!(await verifySignedQuery(env.SESSION_SECRET, url.searchParams))) return json({ error: "Invalid signature" }, env, 400);
  await enqueueEvent(request, env, {
    eventId: createId("evt"),
    eventType: "click",
    messageId: required(url, "messageId"),
    recipientId: url.searchParams.get("recipientId") ?? undefined,
    linkId: required(url, "linkId")
  });
  return Response.redirect(required(url, "url"), 302);
}

async function messageSummary(url: URL, env: Env, userId: string): Promise<Response> {
  const messageId = url.pathname.split("/")[3];
  const rows = await env.DB.prepare(
    `SELECT r.id recipientId, r.email, r.display_name displayName,
      SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END) openCount,
      SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END) clickCount,
      MAX(CASE WHEN e.event_type = 'open' THEN e.created_at ELSE NULL END) lastOpenedAt,
      MAX(CASE WHEN e.event_type = 'click' THEN e.created_at ELSE NULL END) lastClickedAt
    FROM recipients r
    LEFT JOIN tracking_events e ON e.recipient_id = r.id
    JOIN messages m ON m.id = r.message_id
    WHERE m.id = ? AND m.user_id = ?
    GROUP BY r.id`
  ).bind(messageId, userId).all<MessageReadSummary["recipients"][number]>();
  const recipients = rows.results ?? [];
  const summary: MessageReadSummary = {
    messageId,
    totalOpens: recipients.reduce((sum, item) => sum + Number(item.openCount), 0),
    totalClicks: recipients.reduce((sum, item) => sum + Number(item.clickCount), 0),
    recipients
  };
  return json(summary, env);
}

async function listMessages(env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT
      m.id,
      m.subject,
      m.sender_email senderEmail,
      m.status,
      m.created_at createdAt,
      (SELECT COUNT(*) FROM recipients r WHERE r.message_id = m.id) recipientCount,
      (SELECT COUNT(*) FROM tracking_events e WHERE e.message_id = m.id AND e.event_type = 'open') totalOpens,
      (SELECT COUNT(*) FROM tracking_events e WHERE e.message_id = m.id AND e.event_type = 'click') totalClicks,
      (SELECT MAX(e.created_at) FROM tracking_events e WHERE e.message_id = m.id) lastEventAt
    FROM messages m
    WHERE m.user_id = ?
    ORDER BY m.created_at DESC
    LIMIT 100`
  ).bind(userId).all<MessageListItem>();
  return json({ messages: rows.results ?? [] }, env);
}

async function listEvents(url: URL, env: Env, userId: string): Promise<Response> {
  const messageId = url.searchParams.get("messageId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
  const query = messageId
    ? env.DB.prepare(
      `SELECT id, message_id messageId, recipient_id recipientId, link_id linkId, event_type eventType,
        user_agent userAgent, referrer, country, colo, is_bot isBot, confidence, metadata_json metadataJson, created_at createdAt
      FROM tracking_events WHERE user_id = ? AND message_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(userId, messageId, limit)
    : env.DB.prepare(
      `SELECT id, message_id messageId, recipient_id recipientId, link_id linkId, event_type eventType,
        user_agent userAgent, referrer, country, colo, is_bot isBot, confidence, metadata_json metadataJson, created_at createdAt
      FROM tracking_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(userId, limit);
  const rows = await query.all();
  return json({ events: rows.results ?? [] }, env);
}

async function exportEventsCsv(env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT e.created_at createdAt, e.event_type eventType, m.subject, r.email recipientEmail,
      e.country, e.colo, e.is_bot isBot, e.confidence
    FROM tracking_events e
    JOIN messages m ON m.id = e.message_id
    LEFT JOIN recipients r ON r.id = e.recipient_id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC
    LIMIT 5000`
  ).bind(userId).all<Record<string, unknown>>();
  const header = ["createdAt", "eventType", "subject", "recipientEmail", "country", "colo", "isBot", "confidence"];
  const csv = [header.join(","), ...(rows.results ?? []).map((row) => header.map((key) => csvCell(row[key])).join(","))].join("\n");
  return cors(new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=\"who-read-me-events.csv\""
    }
  }), env);
}

async function dashboardStats(env: Env, userId: string): Promise<Response> {
  const stats = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM messages WHERE user_id = ?) messages,
      (SELECT COUNT(*) FROM recipients r JOIN messages m ON m.id = r.message_id WHERE m.user_id = ?) recipients,
      (SELECT COUNT(*) FROM tracking_events WHERE user_id = ? AND event_type = 'open') opens,
      (SELECT COUNT(*) FROM tracking_events WHERE user_id = ? AND event_type = 'click') clicks,
      (SELECT COUNT(*) FROM detection_results WHERE user_id = ? AND risk_level != 'none') detectedTrackers`
  ).bind(userId, userId, userId, userId, userId).first<DashboardStats>();
  return json(stats ?? { messages: 0, recipients: 0, opens: 0, clicks: 0, detectedTrackers: 0 }, env);
}

async function listPairings(env: Env, userId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    "SELECT id, label, created_at createdAt, revoked_at revokedAt FROM extension_pairings WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all<ExtensionPairing>();
  return json({ pairings: rows.results ?? [] }, env);
}

async function revokePairing(url: URL, env: Env, userId: string): Promise<Response> {
  const pairingId = url.pathname.split("/").pop();
  await env.DB.prepare("UPDATE extension_pairings SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .bind(pairingId, userId)
    .run();
  return json({ ok: true }, env);
}

async function getSettings(env: Env): Promise<Response> {
  return json(await readSettings(env), env);
}

async function updateSettings(request: Request, env: Env): Promise<Response> {
  const current = await readSettings(env);
  const body = await request.json<Partial<ProductSettings>>().catch((): Partial<ProductSettings> => ({}));
  const next: ProductSettings = {
    retentionDays: clampInteger(body.retentionDays ?? current.retentionDays, 1, 3650),
    dedupeWindowMinutes: clampInteger(body.dedupeWindowMinutes ?? current.dedupeWindowMinutes, 1, 1440),
    trackerWarningsEnabled: body.trackerWarningsEnabled ?? current.trackerWarningsEnabled
  };
  await env.DB.prepare(
    "INSERT INTO settings (key, value_json, updated_at) VALUES ('product', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP"
  ).bind(JSON.stringify(next)).run();
  return json(next, env);
}

async function detectReceivedTrackers(request: Request, env: Env, userId: string): Promise<Response> {
  const body = await request.json<{ html: string; gmailMessageId?: string }>();
  const result = detectTrackers(body.html);
  await env.DB.prepare("INSERT INTO detection_results (id, user_id, gmail_message_id, risk_level, findings_json) VALUES (?, ?, ?, ?, ?)")
    .bind(createId("det"), userId, body.gmailMessageId ?? null, result.riskLevel, JSON.stringify(result.findings))
    .run();
  return json(result, env);
}

async function enqueueEvent(request: Request, env: Env, event: Pick<QueuedTrackingEvent, "eventId" | "eventType" | "messageId" | "recipientId" | "linkId">): Promise<void> {
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const referrer = request.headers.get("referer") ?? undefined;
  const classification = classifyEventActor(userAgent, referrer);
  const queued = {
    ...event,
    userAgent,
    referrer,
    country: request.cf?.country as string | undefined,
    colo: request.cf?.colo as string | undefined,
    isBot: classification.isBot,
    confidence: classification.confidence,
    reason: classification.reason
  };
  try {
    await env.EVENT_QUEUE.send(queued);
  } catch {
    await persistTrackingEvent(queued, env);
  }
}

async function persistTrackingEvent(event: QueuedTrackingEvent, env: Env): Promise<void> {
  const message = await env.DB.prepare("SELECT user_id FROM messages WHERE id = ?").bind(event.messageId).first<{ user_id: string }>();
  if (!message) return;
  const settings = await readSettings(env);
  const duplicate = await env.DB.prepare(
    `SELECT id FROM tracking_events
    WHERE message_id = ?
      AND COALESCE(recipient_id, '') = COALESCE(?, '')
      AND COALESCE(link_id, '') = COALESCE(?, '')
      AND event_type = ?
      AND COALESCE(user_agent, '') = COALESCE(?, '')
      AND created_at >= datetime('now', ?)
    LIMIT 1`
  ).bind(
    event.messageId,
    event.recipientId ?? null,
    event.linkId ?? null,
    event.eventType,
    event.userAgent ?? null,
    `-${settings.dedupeWindowMinutes} minutes`
  ).first();
  if (duplicate) return;
  await env.DB.prepare(
    "INSERT INTO tracking_events (id, user_id, message_id, recipient_id, link_id, event_type, user_agent, referrer, country, colo, is_bot, confidence, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(
    event.eventId,
    message.user_id,
    event.messageId,
    event.recipientId ?? null,
    event.linkId ?? null,
    event.eventType,
    event.userAgent ?? null,
    event.referrer ?? null,
    event.country ?? null,
    event.colo ?? null,
    event.isBot ? 1 : 0,
    event.confidence,
    JSON.stringify({ actorReason: event.reason })
  ).run();
}

async function authenticate(request: Request, env: Env): Promise<AuthContext | null> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authenticateExtension(authorization.slice("Bearer ".length), env);

  const session = readCookie(request, "wrm_session");
  if (!session) return null;
  const [sessionId, signature] = session.split(".");
  if (!sessionId || !signature || !(await verifyHmac(env.SESSION_SECRET, sessionId, signature))) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP"
  ).bind(sessionId).first<{ id: string; email: string; name?: string }>();
  return row ? { user: row, kind: "cookie", csrfToken: await hmacSign(env.SESSION_SECRET, `${sessionId}.csrf`) } : null;
}

async function authenticateExtension(token: string, env: Env): Promise<AuthContext | null> {
  const tokenHash = await cryptoHash(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.name FROM extension_pairings p JOIN users u ON u.id = p.user_id WHERE p.token_hash = ? AND p.revoked_at IS NULL"
  ).bind(tokenHash).first<{ id: string; email: string; name?: string }>();
  return row ? { user: row, kind: "extension" } : null;
}

async function signSession(env: Env, sessionId: string): Promise<string> {
  return hmacSign(env.SESSION_SECRET, sessionId);
}

async function cryptoHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJwt<T>(jwt: string): T {
  const [, payload] = jwt.split(".");
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(atob(padded)) as T;
}

function required(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function json(body: unknown, env: Env, status = 200): Response {
  return cors(Response.json(body, { status }), env);
}

function cors(response: Response | null, env: Env, status = 204): Response {
  const target = response ?? new Response(null, { status });
  const headers = new Headers(target.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) headers.set(key, value);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(target.body, { status: target.status, headers });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.APP_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  };
}

function cookie(name: string, value: string, options: { maxAge: number }): string {
  return `${name}=${value}; Max-Age=${options.maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function logout(env: Env): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: env.APP_ORIGIN,
      "set-cookie": "wrm_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      ...corsHeaders(env)
    }
  });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function securityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
  };
}

function pixelHeaders(): HeadersInit {
  return {
    "content-type": "image/gif",
    "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    ...securityHeaders()
  };
}

async function authorizeMutation(request: Request, env: Env, auth: AuthContext): Promise<boolean> {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  if (auth.kind === "extension") return true;
  const session = readCookie(request, "wrm_session");
  const sessionId = session?.split(".")[0];
  if (!sessionId) return false;
  const expected = await hmacSign(env.SESSION_SECRET, `${sessionId}.csrf`);
  return request.headers.get("x-wrm-csrf") === expected;
}

async function allowRate(request: Request, env: Env, bucket: string, limit: number): Promise<boolean> {
  const now = new Date();
  const resetAt = new Date(Math.floor(now.getTime() / 60000) * 60000 + 60000).toISOString();
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const key = `${bucket}:${ip}:${resetAt}`;
  try {
    const current = await env.DB.prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?").bind(key).first<{ count: number; reset_at: string }>();
    if (current && current.count >= limit) return false;
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1"
    ).bind(key, resetAt).run();
    await env.DB.prepare("DELETE FROM rate_limits WHERE reset_at < datetime('now', '-10 minutes')").run();
  } catch {
    return true;
  }
  return true;
}

async function readSettings(env: Env): Promise<ProductSettings> {
  const fallback: ProductSettings = { retentionDays: 365, dedupeWindowMinutes: 15, trackerWarningsEnabled: true };
  const row = await env.DB.prepare("SELECT value_json FROM settings WHERE key = 'product'").first<{ value_json: string }>();
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value_json) };
  } catch {
    return fallback;
  }
}

async function applyRetention(env: Env): Promise<void> {
  const settings = await readSettings(env);
  await env.DB.prepare("DELETE FROM tracking_events WHERE created_at < datetime('now', ?)")
    .bind(`-${settings.retentionDays} days`)
    .run();
  await env.DB.prepare("DELETE FROM detection_results WHERE created_at < datetime('now', ?)")
    .bind(`-${settings.retentionDays} days`)
    .run();
}

function clampInteger(value: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, normalized));
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function buildTrackedHtml(html: string, env: Env, messageId: string, recipientId: string): Promise<string> {
  const rewritten = await rewriteLinks(html, env, messageId, recipientId);
  const pixelQuery = await signedQuery(env.SESSION_SECRET, { messageId, recipientId });
  const pixelUrl = `${env.API_ORIGIN}/track/open.gif?${pixelQuery}`;
  return `${rewritten}<img src="${escapeAttribute(pixelUrl)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;">`;
}

async function rewriteLinks(html: string, env: Env, messageId: string, recipientId: string): Promise<string> {
  const matches = Array.from(html.matchAll(/href=(["'])(https?:\/\/[^"']+)\1/gi));
  let rewritten = html;
  for (const match of matches) {
    const originalUrl = match[2];
    const linkId = createId("lnk");
    await env.DB.prepare("INSERT INTO tracked_links (id, message_id, recipient_id, original_url) VALUES (?, ?, ?, ?)")
      .bind(linkId, messageId, recipientId, originalUrl)
      .run();
    const query = await signedQuery(env.SESSION_SECRET, { messageId, recipientId, linkId, url: originalUrl });
    const trackedUrl = `${env.API_ORIGIN}/track/click?${query}`;
    rewritten = rewritten.replace(originalUrl, escapeAttribute(trackedUrl));
  }
  return rewritten;
}

async function getGmailAccessToken(env: Env, userId: string): Promise<string | null> {
  const user = await env.DB.prepare("SELECT gmail_refresh_token FROM users WHERE id = ?").bind(userId).first<{ gmail_refresh_token?: string }>();
  if (!user?.gmail_refresh_token) return null;
  const refreshToken = await decryptSecret(env, user.gmail_refresh_token);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) return null;
  const token = await response.json<{ access_token: string }>();
  return token.access_token;
}

async function encryptSecret(env: Env, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await aesKey(env);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(encrypted))}`;
}

async function decryptSecret(env: Env, value: string): Promise<string> {
  const [ivText, encryptedText] = value.split(".");
  const key = await aesKey(env);
  const iv = Uint8Array.from(fromBase64Url(ivText));
  const encrypted = Uint8Array.from(fromBase64Url(encryptedText));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

async function aesKey(env: Env): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SESSION_SECRET));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function createMimeMessage(input: { from: string; to: string; subject: string; html: string; text: string }): string {
  const boundary = `wrm_${crypto.randomUUID()}`;
  const message = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(new TextEncoder().encode(input.text)),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64(new TextEncoder().encode(input.html)),
    "",
    `--${boundary}--`
  ].join("\r\n");
  return base64Url(new TextEncoder().encode(message));
}

function encodeHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${base64(new TextEncoder().encode(value))}?=`;
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function base64Url(bytes: Uint8Array): string {
  return base64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
