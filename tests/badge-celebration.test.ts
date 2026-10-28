import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import BadgeCelebration from "../src/BadgeCelebration";

test("celebration groups badges, traps focus, dismisses and restores focus without replay on rerender", async () => {
  const dom = new JSDOM(
    '<button id="previous">Open</button><div id="root"></div>',
  );
  for (const key of ["window", "document", "navigator"])
    Object.defineProperty(globalThis, key, {
      value: (dom.window as any)[key],
      configurable: true,
    });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let tones = 0;
  class AudioMock {
    state = "running";
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect() {},
        disconnect() {},
        start() {
          tones++;
        },
        stop() {},
        onended: null,
      };
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    async close() {
      this.state = "closed";
    }
    async suspend() {
      this.state = "suspended";
    }
    async resume() {
      this.state = "running";
    }
  }
  Object.assign(dom.window, { AudioContext: AudioMock });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const previous = document.getElementById("previous")!;
  previous.focus();
  const badge = {
    id: "one",
    name: "First Quest",
    icon: "⭐",
    color: "#ffcc44",
    rule: "Complete a quest",
  };
  const dismissed: boolean[] = [];
  const muted: boolean[] = [];
  const props = {
    badges: [badge, badge],
    muted: false,
    busy: false,
    onMute: (v: boolean) => muted.push(v),
    onDismiss: (v: boolean) => dismissed.push(v),
  };
  await act(async () =>
    root.render(React.createElement(BadgeCelebration, props)),
  );
  assert.equal(document.querySelectorAll(".celebration-badge").length, 1);
  assert.equal(document.activeElement?.getAttribute("role"), "dialog");
  assert.equal(tones, 3);
  const buttons = [...document.querySelectorAll("button")].filter(
    (b) => b.id !== "previous",
  );
  buttons.at(-1)!.focus();
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.activeElement, buttons[0]);
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.activeElement, buttons.at(-1));
  await act(async () => buttons[0].click());
  assert.deepEqual(muted, [true]);
  await act(async () =>
    root.render(
      React.createElement(BadgeCelebration, {
        ...props,
        muted: true,
        busy: true,
      }),
    ),
  );
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.deepEqual(dismissed, []);
  await act(async () =>
    root.render(
      React.createElement(BadgeCelebration, { ...props, muted: true }),
    ),
  );
  assert.equal(tones, 3);
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.deepEqual(dismissed, [false]);
  await act(async () => buttons.at(-1)!.click());
  assert.deepEqual(dismissed, [false, true]);
  await act(async () => root.unmount());
  assert.equal(document.activeElement, previous);
  assert.equal(document.body.style.overflow, "");
  dom.window.close();
});
