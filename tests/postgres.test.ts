import { test } from "node:test";
import assert from "node:assert/strict";

import worker, { hash } from "../server/index.ts";
import { PGlite } from "@electric-sql/pglite";
import { postgresDatabase, schema } from "../server/postgres";
const postgres = new PGlite();
async function database() {
  await postgres.exec("DROP TABLE IF EXISTS learner,access,sessions,throttle;");
  await postgres.exec(schema);
  return postgresDatabase(postgres);
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
    DB: await database(),
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

test("parent PIN is isolated, expires, throttles and reporting never writes progress", async () => {
  const { env, cookie } = await fixture();
  env.PARENT_PIN = "8274"; // Test-only credential.
  await worker.fetch(req("/api/state", undefined, cookie), env);
  const before = await env.DB.prepare(
    "SELECT version,data FROM learner WHERE id=1",
  ).first();
  assert.equal(
    (await worker.fetch(req("/api/parent/progress", undefined, cookie), env))
      .status,
    401,
  );
  assert.equal(
    (await worker.fetch(req("/api/parent/login", { pin: "0000" }), env)).status,
    401,
  );
  const login = await worker.fetch(
    req("/api/parent/login", { pin: env.PARENT_PIN }),
    env,
  );
  assert.equal(login.status, 200);
  const { token } = (await login.json()) as any;
  const read = (t: string) =>
    new Request(origin + "/api/parent/progress", {
      headers: { Authorization: "Bearer " + t },
    });
  const report = await worker.fetch(read(token), env);
  assert.equal(report.status, 200);
  assert.equal(((await report.json()) as any).books.length, 10);
  assert.deepEqual(
    await env.DB.prepare("SELECT version,data FROM learner WHERE id=1").first(),
    before,
  );
  assert.equal((await worker.fetch(read(token + "x"), env)).status, 401);
  assert.equal(
    (await worker.fetch(read("1." + token.split(".").slice(1).join(".")), env))
      .status,
    401,
  );
  const mutation = new Request(origin + "/api/action", {
    method: "POST",
    headers: { Origin: origin, Authorization: "Bearer " + token },
    body: "{}",
  });
  assert.equal((await worker.fetch(mutation, env)).status, 401);
  env.PARENT_PIN = "9385";
  assert.equal((await worker.fetch(read(token), env)).status, 401);
  for (let i = 0; i < 3; i++)
    await worker.fetch(req("/api/parent/login", { pin: "0000" }), env);
  assert.equal(
    (await worker.fetch(req("/api/parent/login", { pin: env.PARENT_PIN }), env))
      .status,
    429,
  );
  const cross = new Request(origin + "/api/parent/login", {
    method: "POST",
    headers: { Origin: "https://wrong.example" },
    body: "{}",
  });
  assert.equal((await worker.fetch(cross, env)).status, 403);
});
