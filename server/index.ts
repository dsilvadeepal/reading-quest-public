import catalogData from "./catalog.json";
import {
  initialState,
  act,
  view,
  retireQueuedQuestions,
  initializeTracking,
} from "./engine";
import type { State, Question, Action } from "../shared/types";
import { parentReport } from "./parent";
interface Env {
  PARENT_PIN?: string;
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_SECRET?: string;
  LOCAL_PREVIEW?: string;
  VOICE_ENABLED?: string;
  ELEVENLABS_API_KEY?: string;
}
const catalog = catalogData as Question[];
const json = (
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
export async function hash(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
function local(req: Request, env: Env) {
  return (
    env.LOCAL_PREVIEW === "true" &&
    ["127.0.0.1", "localhost"].includes(new URL(req.url).hostname)
  );
}
function cookie(req: Request, token: string, maxAge = 7776000) {
  return `quest=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function load(
  env: Env,
  retries = 0,
): Promise<{ version: number; state: State }> {
  const row = await env.DB.prepare(
    "SELECT version,data FROM learner WHERE id=1",
  ).first<{ version: number; data: string }>();
  if (row) {
    const state = JSON.parse(row.data) as State;
    const trackingChanged = initializeTracking(state, Date.now());
    if (retireQueuedQuestions(state) || trackingChanged) {
      state.version = row.version + 1;
      const saved = await env.DB.prepare(
        "UPDATE learner SET version=?,data=? WHERE id=1 AND version=?",
      )
        .bind(state.version, JSON.stringify(state), row.version)
        .run();
      if (saved.meta.changes !== 1) {
        if (retries >= 3) throw Error("Progress changed; please retry.");
        return load(env, retries + 1);
      }
      return { version: state.version, state };
    }
    return { version: row.version, state };
  }
  const state = initialState();
  initializeTracking(state, Date.now());
  await env.DB.prepare(
    "INSERT OR IGNORE INTO learner(id,version,data) VALUES(1,0,?)",
  )
    .bind(JSON.stringify(state))
    .run();
  return { version: 0, state };
}
async function authenticated(req: Request, env: Env) {
  const token = req.headers
    .get("Cookie")
    ?.match(/(?:^|;\s*)quest=([^;]+)/)?.[1];
  if (!token) return false;
  if (local(req, env) && token === "local-preview") return true;
  if (!env.AUTH_SECRET) return false;
  const tokenHash = await hash(env.AUTH_SECRET, "session:" + token);
  return !!(await env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash=? AND expires>? AND generation=(SELECT generation FROM access WHERE id=1)",
  )
    .bind(tokenHash, Date.now())
    .first());
}
async function reserve(env: Env, key: string, limit: number, window: number) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "INSERT INTO throttle(key,count,until_ms) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN until_ms<=? THEN 1 ELSE count+1 END, until_ms=CASE WHEN until_ms<=? THEN ? ELSE until_ms END RETURNING count",
  )
    .bind(key, now + window, now, now, now + window)
    .first<{ count: number }>();
  return !!row && row.count <= limit;
}
async function api(req: Request, env: Env) {
  const url = new URL(req.url),
    path = url.pathname;
  if (req.method !== "GET" && req.headers.get("Origin") !== url.origin)
    return json({ error: "Please open this app directly to continue." }, 403);
  // Separate, short-lived parent capability; never grants learner mutation access.
  if (path.startsWith("/api/parent/")) {
    if (!env.AUTH_SECRET || !/^\d{4}$/.test(env.PARENT_PIN || ""))
      return json(
        { error: "Parent access needs setup in Replit Secrets." },
        503,
      );
    if (path === "/api/parent/login" && req.method === "POST") {
      const text = await req.text();
      if (text.length > 200) return json({ error: "Invalid PIN." }, 400);
      let input: any;
      try {
        input = JSON.parse(text);
      } catch {
        return json({ error: "Invalid PIN." }, 400);
      }
      if (!(await reserve(env, "parent-login", 5, 900000)))
        return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
      if (
        typeof input.pin !== "string" ||
        !/^\d{4}$/.test(input.pin) ||
        !same(
          await hash(env.AUTH_SECRET, "parent-pin:" + input.pin),
          await hash(env.AUTH_SECRET, "parent-pin:" + env.PARENT_PIN),
        )
      )
        return json({ error: "That parent PIN didn’t match." }, 401);
      const payload = `${Date.now() + 900000}.${crypto.randomUUID()}`;
      const signature = await hash(
        env.AUTH_SECRET,
        "parent:" + env.PARENT_PIN + ":" + payload,
      );
      return json({ token: payload + "." + signature });
    }
    const token =
      req.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
    const parts = token.split(".");
    if (
      parts.length !== 3 ||
      !/^\d+$/.test(parts[0]) ||
      Number(parts[0]) <= Date.now() ||
      Number(parts[0]) > Date.now() + 900000 ||
      !same(
        await hash(
          env.AUTH_SECRET,
          "parent:" + env.PARENT_PIN + ":" + parts[0] + "." + parts[1],
        ),
        parts[2],
      )
    )
      return json({ error: "Enter your parent PIN to continue." }, 401);
    if (path === "/api/parent/progress" && req.method === "GET") {
      // Deliberately avoid load(): reporting must not migrate or write learner state.
      const row = await env.DB.prepare(
        "SELECT version,data FROM learner WHERE id=1",
      ).first<{ data: string }>();
      return json(
        parentReport(
          row ? JSON.parse(row.data) : initialState(),
          catalog,
          Date.now(),
        ),
      );
    }
    return json({ error: "Not found" }, 404);
  }
  if (path === "/api/config") {
    const access = await env.DB.prepare(
      "SELECT invite_hash FROM access WHERE id=1",
    ).first<{ invite_hash: string }>();
    return json({
      pinEnabled: access?.invite_hash === "pin-only",
      localPreview: local(req, env),
      voiceEnabled: env.VOICE_ENABLED === "true" && !!env.ELEVENLABS_API_KEY,
    });
  }
  if (path === "/api/dev-login") {
    if (!local(req, env) || req.method !== "POST")
      return json({ error: "Not found" }, 404);
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(req, "local-preview"),
    });
  }
  if (path === "/api/login" && req.method === "POST") {
    if (!env.AUTH_SECRET)
      return json({ error: "Private access is not set up yet." }, 503);
    if (Number(req.headers.get("Content-Length") || 0) > 2000)
      return json({ error: "Invalid sign-in." }, 400);
    const body = await req.text();
    if (body.length > 2000) return json({ error: "Invalid sign-in." }, 400);
    let input: any;
    try {
      input = JSON.parse(body);
    } catch {
      return json({ error: "Invalid sign-in." }, 400);
    }
    const ip = await hash(
      env.AUTH_SECRET,
      "ip:" + (req.headers.get("CF-Connecting-IP") || "local"),
    );
    if (!(await reserve(env, "login:" + ip, 5, 900000)))
      return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
    const record = await env.DB.prepare(
      "SELECT * FROM access WHERE id=1",
    ).first<{ invite_hash: string; pin_hash: string; generation: number }>();
    if (record?.invite_hash === "pin-only") {
      if (!(await reserve(env, "pin-login", 5, 900000)))
        return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
      if (
        typeof input.pin !== "string" ||
        !/^\d{4}$/.test(input.pin) ||
        !same(
          await hash(env.AUTH_SECRET, "pin-only:" + input.pin),
          record.pin_hash,
        )
      )
        return json({ error: "That PIN didn’t match. Try again." }, 401);
    } else {
      if (
        typeof input.invite !== "string" ||
        input.invite.length > 200 ||
        input.invite.length < 32
      )
        return json(
          { error: "Open your private adventure link to set up your PIN." },
          401,
        );
      const ih = await hash(env.AUTH_SECRET, "invite:" + input.invite);
      const ph = await hash(
        env.AUTH_SECRET,
        "pin:" + input.invite + ":" + input.pin,
      );
      if (!record || !same(ih, record.invite_hash))
        return json({ error: "Open your private adventure link." }, 401);
      if (!(await reserve(env, "invite:" + ih, 5, 900000)))
        return json({ error: "Too many tries. Please wait 15 minutes." }, 429);
      if (record.pin_hash !== "link-only" && !same(ph, record.pin_hash))
        return json({ error: "Open your private adventure link." }, 401);
    }
    const token = crypto.randomUUID() + crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO sessions(token_hash,expires,generation) VALUES(?,?,?)",
    )
      .bind(
        await hash(env.AUTH_SECRET, "session:" + token),
        Date.now() + 90 * 86400000,
        record.generation,
      )
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, token) });
  }
  if (!(await authenticated(req, env)))
    return json({ error: "Please sign in to your adventure." }, 401);
  if (path === "/api/set-pin" && req.method === "POST") {
    if (!env.AUTH_SECRET || local(req, env))
      return json({ error: "Use the live app to set a PIN." }, 400);
    const text = await req.text();
    if (text.length > 200) return json({ error: "Invalid PIN." }, 400);
    let input: any;
    try {
      input = JSON.parse(text);
    } catch {
      return json({ error: "Invalid PIN." }, 400);
    }
    if (
      typeof input.pin !== "string" ||
      !/^\d{4}$/.test(input.pin) ||
      input.pin !== input.confirm
    )
      return json({ error: "Enter the same four digits in both boxes." }, 400);
    const result = await env.DB.prepare(
      "UPDATE access SET invite_hash='pin-only',pin_hash=?,generation=generation+1 WHERE id=1 AND invite_hash <> 'pin-only'",
    )
      .bind(await hash(env.AUTH_SECRET, "pin-only:" + input.pin))
      .run();
    if (result.meta.changes !== 1)
      return json({ error: "PIN is already configured." }, 409);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
  }
  if (path === "/api/logout" && req.method === "POST") {
    const token = req.headers.get("Cookie")?.match(/quest=([^;]+)/)?.[1];
    if (token && env.AUTH_SECRET)
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
        .bind(await hash(env.AUTH_SECRET, "session:" + token))
        .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie(req, "", 0) });
  }
  if (path === "/api/state" && req.method === "GET") {
    const { state } = await load(env);
    return json(view(state, catalog, Date.now()));
  }
  if (path === "/api/action" && req.method === "POST") {
    const text = await req.text();
    if (text.length > 4000)
      return json({ error: "That answer is too long." }, 400);
    let a: Action;
    try {
      a = JSON.parse(text);
    } catch {
      return json({ error: "Please try again." }, 400);
    }
    const { state, version } = await load(env);
    if (state.requests.includes(a.requestId))
      return json(view(state, catalog, Date.now()));
    if (a.expectedVersion !== version)
      return json(
        {
          error:
            "Your progress changed on another screen. We refreshed it—please try again.",
          state: view(state, catalog, Date.now()),
        },
        409,
      );
    try {
      act(state, a, catalog, Date.now());
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    const result = await env.DB.prepare(
      "UPDATE learner SET version=?,data=? WHERE id=1 AND version=?",
    )
      .bind(state.version, JSON.stringify(state), version)
      .run();
    if (result.meta.changes !== 1) {
      const fresh = await load(env);
      return json(
        {
          error: "Another screen saved first. Please try again.",
          state: view(fresh.state, catalog, Date.now()),
        },
        409,
      );
    }
    return json(view(state, catalog, Date.now()));
  }
  if (path === "/api/transcribe" && req.method === "POST") {
    if (env.VOICE_ENABLED !== "true" || !env.ELEVENLABS_API_KEY)
      return json(
        { error: "Voice is not ready yet. You can type your answer." },
        503,
      );
    if (Number(req.headers.get("Content-Length") || 0) > 2100000)
      return json({ error: "Try a shorter recording." }, 413);
    if (!(await reserve(env, "voice", 100, 86400000)))
      return json(
        {
          error:
            "Voice limit reached today. You can keep practicing by typing.",
        },
        429,
      );
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > 2100000)
      return json({ error: "Try a shorter recording." }, 413);
    const form = await new Response(bytes, {
      headers: { "Content-Type": req.headers.get("Content-Type") || "" },
    }).formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > 2000000 ||
      file.size < 100 ||
      !/^audio\/(webm|mp4|ogg|wav)/.test(file.type)
    )
      return json({ error: "Please record a short answer again." }, 400);
    const outgoing = new FormData();
    outgoing.set("file", file);
    outgoing.set("model_id", "scribe_v2");
    outgoing.set("diarize", "false");
    outgoing.set("timestamps_granularity", "none");
    outgoing.set("tag_audio_events", "false");
    outgoing.set("language_code", "eng");
    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        body: outgoing,
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok)
      return json(
        { error: "Could not hear that right now. Retry or type your answer." },
        502,
      );
    const data = (await response.json()) as { text?: string };
    return json({ text: data.text?.slice(0, 500) || "" });
  }
  return json({ error: "Not found" }, 404);
}
export default {
  async scheduled(_event: unknown, env: Env) {
    const { state, version } = await load(env);
    const kept = state.disputes.filter(
      (d) => Date.now() - d.time < 30 * 86400000,
    );
    if (kept.length !== state.disputes.length) {
      state.disputes = kept;
      state.version++;
      await env.DB.prepare(
        "UPDATE learner SET version=?,data=? WHERE id=1 AND version=?",
      )
        .bind(state.version, JSON.stringify(state), version)
        .run();
    }
    await env.DB.prepare("DELETE FROM sessions WHERE expires<?")
      .bind(Date.now())
      .run();
    await env.DB.prepare("DELETE FROM throttle WHERE until_ms<?")
      .bind(Date.now())
      .run();
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(req.url).pathname;
      let res: Response;
      if (path.startsWith("/api/")) res = await api(req, env);
      else if (
        /^\/(content|content-review|server|scripts|question-images|\.)(\/|[^/]*)/.test(
          path,
        )
      )
        res = json({ error: "Not found" }, 404);
      else res = await env.ASSETS.fetch(req);
      const headers = new Headers(res.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("Permissions-Policy", "microphone=(self)");
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return json(
        { error: "Could not save or load right now. Please try again." },
        503,
      );
    }
  },
};
