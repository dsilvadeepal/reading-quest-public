import { test } from "node:test";
import assert from "node:assert/strict";
import { recordAnswer } from "../src/voice";
function setup() {
  const doc: any = new EventTarget();
  doc.hidden = false;
  Object.defineProperty(globalThis, "document", {
    value: doc,
    configurable: true,
  });
  let stops = 0;
  let resolve: any;
  const pending = new Promise<any>((r) => (resolve = r));
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getUserMedia: () => pending } },
    configurable: true,
  });
  class Recorder {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      throw Error("Constructor failed");
    }
  }
  Object.defineProperty(globalThis, "MediaRecorder", {
    value: Recorder,
    configurable: true,
  });
  return {
    doc,
    resolve: () => resolve({ getTracks: () => [{ stop: () => stops++ }] }),
    stops: () => stops,
  };
}
test("cancel during pending permission stops acquired stream without recording", async () => {
  const f = setup(),
    controller = new AbortController();
  let calls = 0;
  const p = recordAnswer(
    () => calls++,
    () => {},
    controller.signal,
  ).catch(() => {});
  controller.abort();
  f.resolve();
  await p;
  assert.equal(f.stops(), 1);
  assert.equal(calls, 0);
});
test("hidden during pending permission stops acquired stream", async () => {
  const f = setup();
  let calls = 0;
  const p = recordAnswer(
    () => calls++,
    () => {},
    new AbortController().signal,
  ).catch(() => {});
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event("visibilitychange"));
  f.resolve();
  await p;
  assert.equal(f.stops(), 1);
  assert.equal(calls, 0);
});
test("recorder construction failure releases every microphone track", async () => {
  const f = setup();
  const p = recordAnswer(
    () => {},
    () => {},
    new AbortController().signal,
  ).catch(() => {});
  f.resolve();
  await p;
  assert.equal(f.stops(), 1);
});
