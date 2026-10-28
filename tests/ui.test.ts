import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import App from "../src/App";
async function setup(hash = "", pinEnabled = false, customFetch?: any) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/" + hash,
  });
  for (const k of [
    "window",
    "document",
    "location",
    "history",
    "sessionStorage",
    "navigator",
  ])
    Object.defineProperty(globalThis, k, {
      value: (dom.window as any)[k],
      configurable: true,
    });
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    speechSynthesis: { cancel() {} },
    fetch:
      customFetch ||
      (async (url: string) =>
        new Response(
          JSON.stringify(
            url === "/api/config"
              ? { localPreview: false, pinEnabled }
              : { error: "Sign in" },
          ),
          { status: url === "/api/config" ? 200 : 401 },
        )),
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  await act(async () => root.render(React.createElement(App)));
  return { dom, root };
}
test("ordinary URL has no PIN or invite entry fields", async () => {
  const { dom, root } = await setup();
  assert.equal(document.querySelectorAll("input").length, 0);
  assert.match(document.body.textContent!, /private adventure link/);
  await act(async () => root.unmount());
  dom.window.close();
});
test("pending link invite survives fragment removal before login", async (t) => {
  const { dom, root } = await setup("#private-invite");
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  assert.equal(location.hash, "");
  assert.equal(
    sessionStorage.getItem("quest-pending-invite"),
    "private-invite",
  );
  await act(async () => root.unmount());
  dom.window.close();
});

test("PIN-enabled plain URL shows a four-digit password field without a private link", async () => {
  const { dom, root } = await setup("", true);
  const input = document.querySelector("#quest-pin") as HTMLInputElement;
  assert.ok(input);
  assert.equal(input.type, "password");
  assert.equal(input.maxLength, 4);
  assert.match(document.body.textContent!, /Enter your four-digit PIN/);
  assert.doesNotMatch(
    document.body.textContent!,
    /Open your private adventure link/,
  );
  await act(async () => root.unmount());
  dom.window.close();
});

test("returning to practice with a new badge pauses for celebration before resume", async (t) => {
  const {
    initialState,
    act: engineAct,
    view,
  } = await import("../server/engine.ts");
  const catalog = (
    await import("../server/catalog.json", { with: { type: "json" } })
  ).default;
  const state = initialState();
  engineAct(
    state,
    { type: "start", clientId: "old", requestId: "start" },
    catalog,
    Date.now(),
  );
  const fetcher = async (url: string, opts: any = {}) => {
    if (url === "/api/config") return new Response(JSON.stringify({}));
    if (url === "/api/action") {
      const a = JSON.parse(opts.body);
      engineAct(state, a, catalog, Date.now());
    }
    return new Response(JSON.stringify(view(state, catalog, Date.now())));
  };
  const { dom, root } = await setup("", false, fetcher);
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });
  const resume = [...document.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Resume your quest"),
  )!;
  assert.ok(resume);
  await act(async () => resume.click());
  state.badges.first = "2026-10-24";
  Object.defineProperty(document, "hidden", {
    value: true,
    configurable: true,
  });
  await act(async () =>
    document.dispatchEvent(new dom.window.Event("visibilitychange")),
  );
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
  await act(async () =>
    document.dispatchEvent(new dom.window.Event("visibilitychange")),
  );
  assert.ok(
    document.querySelector('[role="dialog"]'),
    "pending celebration should appear on return",
  );
  assert.match(document.body.textContent!, /Resume your quest/);
  await act(async () => root.unmount());
  dom.window.close();
});
