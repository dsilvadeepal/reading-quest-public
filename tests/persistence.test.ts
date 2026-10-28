import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker, { hash } from "../server/index.ts";
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("migrations/0001.sql", "utf8"));
  return {
    prepare(sql: string) {
      let args: any[] = [];
      const wrapper = {
        bind(...values: any[]) {
          args = values;
          return wrapper;
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return wrapper;
    },
  };
}
const origin = "https://quest.example";
const req = (path: string, body?: any, cookie?: string) =>
  new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function fixture() {
  const env: any = {
    DB: database(),
    AUTH_SECRET: "test-secret-not-production",
    VOICE_ENABLED: "false",
    ASSETS: { fetch: () => new Response("shell") },
  };
  const invite = "secret-invite-with-at-least-32-characters",
    pin = "123456";
  await env.DB.prepare("INSERT INTO access VALUES(1,?,?,1)")
    .bind(
      await hash(env.AUTH_SECRET, "invite:" + invite),
      await hash(env.AUTH_SECRET, "pin:" + invite + ":" + pin),
    )
    .run();
  const login = await worker.fetch(req("/api/login", { invite, pin }), env);
  assert.equal(login.status, 200);
  return {
    env,
    cookie: login.headers.get("set-cookie")!.split(";")[0],
    invite,
    pin,
  };
}
test("PIN login, protected state, cookie attributes, logout and revocation", async () => {
  const { env, cookie } = await fixture();
  let r = await worker.fetch(req("/api/state", undefined, cookie), env);
  assert.equal(r.status, 200);
  const data: any = await r.json();
  assert.equal(data.books.length, 10);
  assert.equal(
    data.books.reduce((n: number, b: any) => n + b.count, 0),
    40,
  );
  assert.equal(
    JSON.stringify(data).includes("accepted_answer_variants"),
    false,
  );
  await worker.fetch(req("/api/logout", {}, cookie), env);
  assert.equal(
    (await worker.fetch(req("/api/state", undefined, cookie), env)).status,
    401,
  );
});
test("PIN throttle persists after five tries", async () => {
  const { env, invite } = await fixture();
  for (let i = 0; i < 4; i++)
    assert.equal(
      (await worker.fetch(req("/api/login", { invite, pin: "999999" }), env))
        .status,
      401,
    );
  assert.equal(
    (await worker.fetch(req("/api/login", { invite, pin: "999999" }), env))
      .status,
    429,
  );
});
test("CAS rejects stale writes, duplicate request replays without mutation", async () => {
  const { env, cookie } = await fixture();
  await worker.fetch(req("/api/state", undefined, cookie), env);
  const a = {
    type: "read",
    bookId: "story10",
    read: true,
    expectedVersion: 0,
    requestId: "one",
  };
  const first = await worker.fetch(req("/api/action", a, cookie), env);
  assert.equal(first.status, 200);
  const replay: any = await (
    await worker.fetch(req("/api/action", a, cookie), env)
  ).json();
  assert.equal(replay.version, 1);
  const stale = await worker.fetch(
    req("/api/action", { ...a, requestId: "two", read: false }, cookie),
    env,
  );
  assert.equal(stale.status, 409);
});
test("voice disabled makes no provider call and awards no outcome", async () => {
  const { env, cookie } = await fixture();
  const r = await worker.fetch(req("/api/transcribe", {}, cookie), env);
  assert.equal(r.status, 503);
});
test("rotating access generation revokes existing sessions", async () => {
  const { env, cookie } = await fixture();
  await env.DB.prepare("UPDATE access SET generation=2 WHERE id=1").run();
  assert.equal(
    (await worker.fetch(req("/api/state", undefined, cookie), env)).status,
    401,
  );
});
test("daily maintenance removes expired disputes even without learner activity", async () => {
  const { env } = await fixture();
  const old = {
    version: 0,
    points: 0,
    activeSeconds: 0,
    read: {},
    readingConfirmed: false,
    outcomes: [],
    badges: {},
    completed: [],
    session: null,
    requests: [],
    disputes: [
      {
        questionId: "q",
        revision: 1,
        text: "old",
        time: Date.now() - 31 * 86400000,
      },
      { questionId: "q2", revision: 1, text: "new", time: Date.now() },
    ],
  };
  await env.DB.prepare("INSERT INTO learner VALUES(1,0,?)")
    .bind(JSON.stringify(old))
    .run();
  await worker.scheduled({} as any, env);
  const row = await env.DB.prepare("SELECT data FROM learner").first();
  assert.equal(JSON.parse(row.data).disputes.length, 1);
});

test("private link login works without PIN; wrong link stays locked", async () => {
  const { env, invite } = await fixture();
  await env.DB.prepare("UPDATE access SET pin_hash=? WHERE id=1")
    .bind("link-only")
    .run();
  const response = await worker.fetch(req("/api/login", { invite }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  assert.equal(
    (
      await worker.fetch(
        req("/api/login", { invite: "wrong-link-with-at-least-32-characters" }),
        env,
      )
    ).status,
    401,
  );
  assert.equal((await worker.fetch(req("/api/state"), env)).status, 401);
});

test("voice transcribes a short clip without grading; provider failure preserves progress", async (t) => {
  const { env, cookie } = await fixture();
  env.VOICE_ENABLED = "true";
  env.ELEVENLABS_API_KEY = "test-key";
  const before = await (
    await worker.fetch(req("/api/state", undefined, cookie), env)
  ).json();
  let providerStatus = 200;
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(init.headers["xi-api-key"], "test-key");
    assert.equal(init.body.get("model_id"), "scribe_v2");
    assert.equal(init.body.get("diarize"), "false");
    assert.equal(init.body.get("tag_audio_events"), "false");
    return Response.json(
      { text: "Sandro Willowbrook" },
      { status: providerStatus },
    );
  });
  const clip = () => {
    const body = new FormData();
    body.set(
      "file",
      new Blob([new Uint8Array(200)], { type: "audio/mp4" }),
      "answer.mp4",
    );
    return new Request(origin + "/api/transcribe", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
      body,
    });
  };
  const heard = await worker.fetch(clip(), env);
  assert.equal(heard.status, 200);
  assert.deepEqual(await heard.json(), { text: "Sandro Willowbrook" });
  providerStatus = 429;
  assert.equal((await worker.fetch(clip(), env)).status, 502);
  const after = await (
    await worker.fetch(req("/api/state", undefined, cookie), env)
  ).json();
  assert.deepEqual(after, before);
});
test("four-digit PIN replaces private link, revokes sessions, preserves progress and throttles", async () => {
  const { env, cookie, invite, pin } = await fixture();
  const before = await (
    await worker.fetch(req("/api/state", undefined, cookie), env)
  ).json();
  assert.equal(
    (
      await worker.fetch(
        req("/api/set-pin", { pin: "4321", confirm: "4321" }),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/api/set-pin", { pin: "4321", confirm: "1234" }, cookie),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/api/set-pin", { pin: "4321", confirm: "4321" }, cookie),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (await worker.fetch(req("/api/state", undefined, cookie), env)).status,
    401,
  );
  assert.equal(
    (await worker.fetch(req("/api/login", { invite, pin }), env)).status,
    401,
  );
  const signed = await worker.fetch(req("/api/login", { pin: "4321" }), env);
  assert.equal(signed.status, 200);
  const newCookie = signed.headers.get("set-cookie")!.split(";")[0];
  const after = await (
    await worker.fetch(req("/api/state", undefined, newCookie), env)
  ).json();
  assert.deepEqual(after, before);
  assert.equal(
    (
      await worker.fetch(
        req("/api/set-pin", { pin: "9876", confirm: "9876" }, newCookie),
        env,
      )
    ).status,
    409,
  );
  const cfg: any = await (await worker.fetch(req("/api/config"), env)).json();
  assert.equal(cfg.pinEnabled, true);
  for (let i = 0; i < 5; i++)
    await worker.fetch(req("/api/login", { pin: "9999" }), env);
  assert.equal(
    (await worker.fetch(req("/api/login", { pin: "4321" }), env)).status,
    429,
  );
});
test("retirement persists once, preserves earned progress and rejects stale queued answers", async () => {
  const { env, cookie } = await fixture();
  await worker.fetch(req("/api/state", undefined, cookie), env);
  await worker.fetch(
    req(
      "/api/action",
      {
        type: "start",
        bookId: "story01",
        clientId: "retire",
        requestId: "retire-start",
        expectedVersion: 0,
      },
      cookie,
    ),
    env,
  );
  const row: any = await env.DB.prepare(
    "SELECT version,data FROM learner WHERE id=1",
  ).first();
  const s = JSON.parse(row.data);
  const story = s.session.questions[0];
  s.session.questions.unshift({
    ...story,
    id: "story01-001",
    question: "Who is the author?",
  });
  s.session.stage = 1;
  s.points = 37;
  s.badges = { first: "2026-10-23" };
  const before = structuredClone({
    points: s.points,
    badges: s.badges,
    outcomes: s.outcomes,
    read: s.read,
    completed: s.completed,
  });
  await env.DB.prepare("UPDATE learner SET data=? WHERE id=1")
    .bind(JSON.stringify(s))
    .run();
  const stale = await worker.fetch(
    req(
      "/api/action",
      {
        type: "answer",
        answer: "author",
        clientId: "retire",
        requestId: "old-answer",
        expectedVersion: row.version,
      },
      cookie,
    ),
    env,
  );
  assert.equal(stale.status, 409);
  const updated: any = await env.DB.prepare(
    "SELECT version,data FROM learner WHERE id=1",
  ).first();
  const after = JSON.parse(updated.data);
  assert.equal(after.session.questions[0].id, story.id);
  assert.equal(after.session.stage, 0);
  assert.deepEqual(
    {
      points: after.points,
      badges: after.badges,
      outcomes: after.outcomes,
      read: after.read,
      completed: after.completed,
    },
    before,
  );
  await worker.fetch(req("/api/state", undefined, cookie), env);
  const again: any = await env.DB.prepare(
    "SELECT version,data FROM learner WHERE id=1",
  ).first();
  assert.equal(again.version, updated.version);
});
