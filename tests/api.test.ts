import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../server/index.ts";
const env: any = {
  LOCAL_PREVIEW: "false",
  ASSETS: { fetch: () => new Response("shell") },
};
test("private endpoints reject missing session before touching DB", async () => {
  for (const path of ["/api/state", "/api/transcribe"]) {
    const r = await worker.fetch(
      new Request("https://quest.example" + path),
      env,
    );
    assert.equal(r.status, 401);
  }
});
test("cross-origin mutations rejected", async () => {
  const r = await worker.fetch(
    new Request("https://quest.example/api/action", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    }),
    env,
  );
  assert.equal(r.status, 403);
});
test("local preview cannot be enabled on public host", async () => {
  const r = await worker.fetch(
    new Request("https://quest.example/api/dev-login", {
      method: "POST",
      headers: { Origin: "https://quest.example" },
    }),
    { ...env, LOCAL_PREVIEW: "true" },
  );
  assert.equal(r.status, 404);
});
test("static shell cannot fetch content catalog as asset", async () => {
  const r = await worker.fetch(
    new Request("https://quest.example/content/approved/story04-v1.json"),
    env,
  );
  assert.equal(r.status, 404);
});
