import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import Parent from "../src/Parent";

test("parent PIN response arriving after tab lock cannot reopen progress", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/parent", pretendToBeVisual: true });
  for (const key of ["window", "document", "navigator"])
    Object.defineProperty(globalThis, key, { value: (dom.window as any)[key], configurable: true });
  let respond!: (response: Response) => void;
  let requests = 0;
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => { requests++; return new Promise<Response>(resolve => { respond = resolve; }); },
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(React.createElement(Parent)));
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", {bubbles: true, cancelable: true})); });
    assert.equal(requests, 1);
    await act(async () => {
      Object.defineProperty(document, "hidden", {value: true, configurable: true});
      document.dispatchEvent(new dom.window.Event("visibilitychange"));
      Object.defineProperty(document, "hidden", {value: false, configurable: true});
      respond(new Response(JSON.stringify({token: `${Date.now()+60000}.test`})));
    });
    assert.equal(requests, 1, "must not fetch progress after a stale login completes");
    assert.ok(document.querySelector("#parent-pin"));
    assert.equal(document.querySelector(".parent-week"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
