import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  act,
  view,
  initializeTracking,
} from "../server/engine.ts";
import { parentReport } from "../server/parent.ts";
const now = Date.parse("2026-10-24T22:00:00Z");
const q = {
  id: "story01-002",
  revision: 1,
  book_id: "story01",
  teacher_number: 2,
  question: "What?",
  answer: "Paint",
  accepted_answer_variants: ["Paint"],
  hint: "Art",
  explanation: "",
  choices: [
    { id: "a", text: "Paint", correct: true },
    { id: "b", text: "Clay", correct: false },
  ],
};
const action = (type: string, extra: any = {}) => ({
  type,
  requestId: crypto.randomUUID(),
  clientId: "test",
  ...extra,
});
test("legacy tracking baseline preserves progress and only celebrates new badges", () => {
  const s = initialState();
  s.badges = { first: "2026-10-23" };
  s.points = 91;
  s.activeSeconds = 688;
  assert.equal(initializeTracking(s, now), true);
  assert.equal(initializeTracking(s, now), false);
  assert.deepEqual(view(s, [q], now).pendingBadges, []);
  assert.equal(s.points, 91);
  assert.equal(s.activeSeconds, 688);
  s.badges.mix = "2026-10-24";
  assert.deepEqual(
    view(s, [q], now).pendingBadges.map((b: any) => b.id),
    ["mix"],
  );
  act(s, action("acknowledge-badges", { badgeIds: ["mix"] }), [q], now);
  assert.deepEqual(view(s, [q], now).pendingBadges, []);
});
test("only valid submitted answers update last practice including wrong attempts", () => {
  const s = initialState();
  act(s, action("start"), [q], now);
  assert.equal(s.lastPracticedAt, undefined);
  assert.throws(() =>
    act(s, action("answer", { answer: "" }), [q], now + 1000),
  );
  assert.equal(s.lastPracticedAt, undefined);
  act(s, action("answer", { answer: "wrong" }), [q], now + 2000);
  assert.equal(s.lastPracticedAt, now + 2000);
  assert.equal(s.outcomes.length, 0);
  const a = action("answer", { answer: "wrong" });
  act(s, a, [q], now + 3000);
  act(s, a, [q], now + 4000);
  assert.equal(s.lastPracticedAt, now + 3000);
  assert.equal(parentReport(s, [q], now + 4000).week.days, 1);
});
test("report uses latest question result and distinguishes unknown daily time", () => {
  const s = initialState();
  initializeTracking(s, now);
  const o = {
    id: "a",
    sessionId: "x",
    questionId: q.id,
    revision: 1,
    bookId: q.book_id,
    day: "2026-10-24",
    time: now,
    correct: false,
    stage: 2,
    points: 1,
  };
  s.outcomes = [
    o,
    { ...o, id: "b", time: now + 1000, correct: true, stage: 0, points: 10 },
    { ...o, id: "c", questionId: "retired" },
  ];
  const r = parentReport(s, [q], now + 2000);
  assert.equal(r.books[0].covered, 1);
  assert.equal(r.books[0].independent, 1);
  assert.equal(r.books[0].review.length, 0);
  assert.equal(r.totals.answered, 1);
  assert.equal(r.historicalAnswers, 1);
  assert.equal(r.week.completeTime, false);
  assert.equal(r.week.calendar.length, 7);
});
test("active heartbeat credits daily time but does not mark answer activity", () => {
  const s = initialState();
  act(s, action("start"), [q], now);
  act(s, action("heartbeat", { active: true }), [q], now + 10000);
  assert.equal(s.dailySeconds?.["2026-10-24"], 10);
  assert.equal(s.lastPracticedAt, undefined);
  act(s, action("heartbeat", { active: false }), [q], now + 20000);
  assert.equal(s.dailySeconds?.["2026-10-24"], 10);
});

test("daily credits split Eastern midnight and calendar survives DST", () => {
  const midnight = Date.parse("2026-10-25T04:00:05Z");
  const s = initialState();
  act(s, action("start"), [q], midnight - 10000);
  act(s, action("heartbeat", { active: true }), [q], midnight);
  assert.equal(s.dailySeconds?.["2026-10-24"], 5);
  assert.equal(s.dailySeconds?.["2026-10-25"], 5);
  const days = parentReport(
    s,
    [q],
    Date.parse("2026-11-02T05:30:00Z"),
  ).week.calendar.map((d) => d.day);
  assert.deepEqual(days, [
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
    "2026-11-02",
  ]);
});
test("acknowledgment and mute preserve active quest and rewards", () => {
  const s = initialState();
  act(s, action("start"), [q], now);
  s.badges.first = "2026-10-24";
  s.points = 91;
  const before = JSON.stringify(s.session);
  act(s, action("badge-sound", { muted: true }), [q], now + 1);
  act(s, action("acknowledge-badges", { badgeIds: ["first"] }), [q], now + 2);
  assert.equal(JSON.stringify(s.session), before);
  assert.equal(s.points, 91);
  assert.equal(s.badgeMuted, true);
  assert.equal(s.badges.first, "2026-10-24");
  assert.throws(() =>
    act(
      s,
      action("acknowledge-badges", { badgeIds: ["unearned"] }),
      [q],
      now + 3,
    ),
  );
});
