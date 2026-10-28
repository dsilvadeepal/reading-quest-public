import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  act,
  view,
  normalize,
  spellingMatch,
  localDay,
  masterDays,
} from "../server/engine.ts";
const q = (id = "test-1", revision = 1) => ({
  id,
  revision,
  book_id: "story01",
  teacher_number: 1,
  question: "Who?",
  answer: "Frank and Madison",
  accepted_answer_variants: ["Frank and Madison"],
  hint: "Two friends",
  explanation: "Both friends.",
  choices: [
    { id: "A", text: "Frank and Madison", correct: true },
    { id: "B", text: "Ivy", correct: false },
    { id: "C", text: "Ember", correct: false },
    { id: "D", text: "Meme", correct: false },
  ],
});
const now = Date.parse("2026-10-23T16:00:00Z");
const action = (type: string, more: any = {}) => ({
  type,
  requestId: crypto.randomUUID(),
  ...more,
});
function start(catalog = [q()]) {
  let s = initialState();
  act(
    s,
    action("start", { bookId: "story01", clientId: "test" }),
    catalog,
    now,
  );
  return s;
}
test("whole answers only; no substring, negation or partial multipart", () => {
  assert.equal(normalize("  FRANK and Madison! "), "frank and madison");
  let s = start();
  act(s, action("answer", { answer: "Frank", clientId: "test" }), [q()], now);
  assert.equal(s.session?.stage, 1);
  assert.equal(s.outcomes.length, 0);
});
test("hint then options then reveal; only one final outcome", () => {
  let s = start();
  for (let i = 0; i < 2; i++)
    act(s, action("answer", { answer: "wrong", clientId: "test" }), [q()], now);
  assert.equal(s.session?.stage, 2);
  assert.equal(view(s, [q()], now).session.question.choices.length, 4);
  act(s, action("answer", { choiceId: "B", clientId: "test" }), [q()], now);
  assert.equal(s.outcomes[0].points, 1);
  assert.equal(s.outcomes[0].stage, 2);
  assert.equal(
    view(s, [q()], now).session.question.answer,
    "Frank and Madison",
  );
});
test("keys and hint not exposed at first stage", () => {
  const v = view(start(), [q()], now);
  assert.equal(v.session.question.answer, undefined);
  assert.equal(v.session.question.hint, undefined);
  assert.equal(v.session.question.choices, undefined);
});
test("duplicate requests and repeated same-day sessions do not farm points", () => {
  let s = start();
  const a = action("answer", { answer: "Frank and Madison", clientId: "test" });
  act(s, a, [q()], now);
  act(s, a, [q()], now);
  assert.equal(s.outcomes.length, 1);
  act(s, action("finish", { clientId: "test" }), [q()], now);
  act(
    s,
    action("start", { bookId: "story01", clientId: "test" }),
    [q()],
    now,
  );
  act(
    s,
    action("answer", { answer: "Frank and Madison", clientId: "test" }),
    [q()],
    now,
  );
  assert.equal(s.points, 10);
});
test("no fake questions, no duplicates, and unread books may be practiced", () => {
  let s = initialState();
  assert.throws(() =>
    act(s, action("start", { bookId: "story10", clientId: "test" }), [], now),
  );
  let c = Array.from({ length: 20 }, (_, i) => q("q" + i));
  s = start(c);
  assert.equal(s.session?.questions.length, 12);
  assert.equal(new Set(s.session?.questions.map((x) => x.id)).size, 12);
});
test("session pins content revision and new revision does not inherit mastery", () => {
  let s = start();
  act(
    s,
    action("answer", { answer: "Frank and Madison", clientId: "test" }),
    [q("test-1", 2)],
    now,
  );
  assert.equal(s.outcomes[0].revision, 1);
  assert.equal(masterDays(s, [q("test-1", 2)], "story01").length, 0);
});
test("mastery needs full first-encounter coverage on two days", () => {
  let s = start();
  act(
    s,
    action("answer", { answer: "Frank and Madison", clientId: "test" }),
    [q()],
    now,
  );
  assert.equal(masterDays(s, [q()], "story01").length, 1);
  act(s, action("finish", { clientId: "test" }), [q()], now);
  act(
    s,
    action("start", { bookId: "story01", clientId: "test" }),
    [q()],
    now + 86400000,
  );
  act(
    s,
    action("answer", { answer: "Frank and Madison", clientId: "test" }),
    [q()],
    now + 86400000,
  );
  assert.ok(s.badges["master-story01"]);
  assert.equal(masterDays(s, [q(), q("new")], "story01").length, 0);
  assert.ok(s.badges["master-story01"]);
});
test("New York day and DST boundaries", () => {
  assert.equal(localDay(Date.parse("2026-11-01T04:30:00Z")), "2026-11-01");
  assert.equal(localDay(Date.parse("2026-10-23T02:00:00Z")), "2026-10-22");
});
test("second device must explicitly resume; heartbeat cannot double count", () => {
  let s = start();
  assert.throws(() =>
    act(
      s,
      action("answer", { answer: "Frank and Madison", clientId: "other" }),
      [q()],
      now,
    ),
  );
  act(
    s,
    action("heartbeat", { clientId: "test", active: true }),
    [q()],
    now + 15000,
  );
  assert.equal(s.activeSeconds, 15);
  act(
    s,
    action("heartbeat", { clientId: "test", active: true }),
    [q()],
    now + 15000,
  );
  assert.equal(s.activeSeconds, 15);
  act(
    s,
    action("heartbeat", { clientId: "test", active: false }),
    [q()],
    now + 30000,
  );
  assert.equal(s.activeSeconds, 15);
});
test("empty submission does not consume a try", () => {
  let s = start();
  assert.throws(() =>
    act(s, action("answer", { answer: " ", clientId: "test" }), [q()], now),
  );
  assert.equal(s.session?.stage, 0);
});
test("mixed fallback draws from all available books when current book is empty", () => {
  const c = ["story01", "story04", "story05", "story02"].flatMap((b) =>
    Array.from({ length: 15 }, (_, i) => ({ ...q(b + i), book_id: b })),
  );
  const s = initialState();
  act(s, action("start", { clientId: "test" }), c, now);
  assert.equal(new Set(s.session!.questions.map((q) => q.book_id)).size, 4);
});
test("unmarking a read book does not grant retrospective reading badges", () => {
  const s = initialState();
  act(s, action("read", { bookId: "story02", read: false }), [q()], now);
  assert.equal(s.badges["read-1"], undefined);
});
test("approved required parts accept both concise parts, not only one", () => {
  const c = [
    {
      ...q(),
      accepted_answer_variants: ["When lighting is low and she is in a crowd"],
      required_answer_parts: ["Low lighting", "Crowds"],
    },
  ];
  const s = start(c);
  act(
    s,
    action("answer", { answer: "Low lighting and crowds", clientId: "test" }),
    c,
    now,
  );
  assert.equal(s.outcomes[0]?.correct, true);
});
test("numeric normalization preserves meaningful signs and decimal separators", () => {
  assert.notEqual(normalize("-3"), normalize("3"));
  assert.notEqual(normalize("1.5"), normalize("15"));
  const c = [{ ...q(), accepted_answer_variants: ["3"] }];
  const s = start(c);
  act(s, action("answer", { answer: "-3", clientId: "test" }), c, now);
  assert.equal(s.session!.stage, 1);
  assert.equal(s.points, 0);
});
test("paused or delayed heartbeat never retrospectively credits hidden time", () => {
  const s = start();
  act(
    s,
    action("heartbeat", { clientId: "test", active: true }),
    [q()],
    now + 45000,
  );
  assert.equal(s.activeSeconds, 0);
  act(
    s,
    action("heartbeat", { clientId: "test", active: false }),
    [q()],
    now + 46000,
  );
  act(
    s,
    action("heartbeat", { clientId: "test", active: true }),
    [q()],
    now + 60000,
  );
  assert.equal(s.activeSeconds, 0);
  act(
    s,
    action("heartbeat", { clientId: "test", active: true }),
    [q()],
    now + 75000,
  );
  assert.equal(s.activeSeconds, 15);
});

test("all ten books have introductions; unread recaps and source links stay server-side", () => {
  const s = initialState();
  for (const id of Object.keys(s.read)) s.read[id] = false;
  const locked = view(s, [], now).books;
  assert.equal(locked.length, 10);
  for (const book of locked) {
    assert.ok(book.introduction.length > 50);
    assert.equal(book.recap, "Finish this book to unlock its full recap.");
    assert.deepEqual(book.summarySources, []);
    s.read[book.id] = true;
  }
  for (const book of view(s, [], now).books) {
    assert.ok(book.recap.length > 100);
    assert.deepEqual(book.summarySources, []); // Original sample stories need no external source.
  }
});

test("minor spelling slips pass while missing parts and changed numbers do not", () => {
  assert.equal(
    spellingMatch("Taylor Morgan Reed", "Taylor Morgan Reed"),
    true,
  );
  assert.equal(
    spellingMatch("Taylorr Morgan Reed", "Taylor Morgan Reed"),
    true,
  );
  assert.equal(spellingMatch("Willoowbrook", "Willowbrook"), true);
  assert.equal(spellingMatch("Madiosn and Frank", "Madison and Frank"), true);
  assert.equal(spellingMatch("Frank", "Frank and Madison"), false);
  assert.equal(spellingMatch("13", "12"), false);
  assert.equal(spellingMatch("not happy", "happy"), false);
  assert.equal(spellingMatch("lime and chalk", "lime and cheese"), false);
  assert.equal(spellingMatch("cat", "bat"), false);
});
test("spelling acceptance earns normal points and reveals canonical spelling", () => {
  const s = start();
  act(
    s,
    action("answer", { answer: "Frank and Madiosn", clientId: "test" }),
    [q()],
    now,
  );
  assert.equal(s.outcomes[0].correct, true);
  assert.equal(s.outcomes[0].points, 10);
  assert.equal(
    view(s, [q()], now).session.question.answer,
    "Frank and Madison",
  );
});
test("a known wrong choice is not accepted as a spelling slip", () => {
  const question = q();
  question.choices[1].text = "Frank and Madisyn";
  const s = start([question]);
  act(
    s,
    action("answer", { answer: "Frank and Madisyn", clientId: "test" }),
    [question],
    now,
  );
  assert.equal(s.session?.stage, 1);
  assert.equal(s.outcomes.length, 0);
});
test("restart replaces the session atomically and keeps earned progress", () => {
  const s = start();
  act(
    s,
    action("answer", { answer: "Frank and Madison", clientId: "test" }),
    [q()],
    now,
  );
  const oldId = s.session!.id;
  const points = s.points;
  const badges = structuredClone(s.badges);
  act(s, action("restart", { clientId: "test" }), [q()], now + 86400000);
  assert.notEqual(s.session!.id, oldId);
  assert.equal(s.session!.index, 0);
  assert.equal(s.session!.stage, 0);
  assert.equal(s.session!.mode, "mix");
  assert.equal(s.points, points);
  assert.equal(s.outcomes.length, 1);
  for (const [id, earned] of Object.entries(badges))
    assert.equal(s.badges[id], earned);
});
test("failed fresh quest leaves current session intact", () => {
  const s = start();
  const before = structuredClone(s);
  assert.throws(() => act(s, action("restart", { clientId: "test" }), [], now));
  assert.deepEqual(s, before);
});
test("retiring queued author questions preserves outcomes and unaffected question hints", async () => {
  const { retireQueuedQuestions } = await import("../server/engine.ts");
  const s = start([q("story-1"), q("story-2")]);
  s.points = 25;
  s.badges = { first: "2026-10-23" };
  s.session!.questions = [q("story-1"), q("story01-001"), q("story-2")];
  s.session!.stage = 1;
  const prior = structuredClone({
    points: s.points,
    badges: s.badges,
    outcomes: s.outcomes,
    read: s.read,
    completed: s.completed,
  });
  assert.equal(retireQueuedQuestions(s), true);
  assert.equal(s.session!.questions[0].id, "story-1");
  assert.equal(s.session!.stage, 1);
  assert.equal(s.session!.questions.length, 2);
  assert.deepEqual(
    {
      points: s.points,
      badges: s.badges,
      outcomes: s.outcomes,
      read: s.read,
      completed: s.completed,
    },
    prior,
  );
  assert.equal(retireQueuedQuestions(s), false);
});
test("current author question is skipped without a scored attempt", async () => {
  const { retireQueuedQuestions } = await import("../server/engine.ts");
  const s = start([q("story-1")]);
  s.session!.questions = [q("story01-001"), q("story-1")];
  s.session!.stage = 1;
  retireQueuedQuestions(s);
  assert.equal(s.session!.questions[s.session!.index].id, "story-1");
  assert.equal(s.session!.stage, 0);
  assert.equal(s.points, 0);
  assert.equal(s.outcomes.length, 0);
});
test("articles and approved plurals accept natural answers without losing meaning", () => {
  for (const answer of [
    "A detective rule",
    "The detective rule",
    "Detective rules",
  ]) {
    const question = {
      ...q(),
      question: "What does each chapter open with?",
      answer: "Detective Rule",
      accepted_answer_variants: ["Detective Rule"],
    };
    const s = start([question]);
    act(s, action("answer", { answer, clientId: "test" }), [question], now);
    assert.equal(s.outcomes[0]?.correct, true, answer);
    assert.equal(s.outcomes[0]?.points, 10);
    assert.equal(
      view(s, [question], now).session.question.answer,
      "Detective Rule",
    );
  }
  const question = {
    ...q(),
    question: "What does each chapter open with?",
    answer: "Detective Rule",
    accepted_answer_variants: ["Detective Rule"],
  };
  for (const answer of [
    "Not a detective rule",
    "A detective",
    "A detective rule or a map",
  ]) {
    const s = start([question]);
    act(s, action("answer", { answer, clientId: "test" }), [question], now);
    assert.equal(s.outcomes.length, 0, answer);
  }
});
test("Opal nickname aliases preserve both required people and work in saved questions", () => {
  const question = {
    ...q("story04-028"),
    book_id: "story04",
    required_answer_parts: ["Frank", "Madison"],
  };
  for (const answer of ["Frank and Maddie", "Maddie and Frank"]) {
    const s = start();
    s.session!.questions = [question];
    act(s, action("answer", { answer, clientId: "test" }), [question], now);
    assert.equal(s.outcomes[0]?.correct, true);
  }
  const s = start();
  s.session!.questions = [question];
  act(
    s,
    action("answer", { answer: "Maddie", clientId: "test" }),
    [question],
    now,
  );
  assert.equal(s.session!.stage, 1);
  const single = {
    ...question,
    id: "story04-003",
    answer: "Madison",
    accepted_answer_variants: ["Madison"],
    required_answer_parts: undefined,
  };
  const one = start();
  one.session!.questions = [single];
  act(
    one,
    action("answer", { answer: "Maddie", clientId: "test" }),
    [single],
    now,
  );
  assert.equal(one.outcomes[0]?.correct, true);
});
test("plural normalization does not change quantity answers or unrelated names", async () => {
  const { wordingNormalize } = await import("../server/engine.ts");
  const context = { book_id: "story04", question: "What does she find?" };
  assert.equal(
    wordingNormalize("A mask", context),
    wordingNormalize("Masks", context),
  );
  assert.notEqual(
    wordingNormalize("one key", context),
    wordingNormalize("two keys", context),
  );
  assert.notEqual(
    wordingNormalize("Maddie", { ...context, book_id: "story02" }),
    wordingNormalize("Madison", { ...context, book_id: "story02" }),
  );
  assert.notEqual(
    wordingNormalize("keys", { ...context, question: "How many keys?" }),
    wordingNormalize("key", { ...context, question: "How many keys?" }),
  );
});

function coverageFixture(unseenCount: number) {
  const c = Array.from({ length: unseenCount + 20 }, (_, i) => q(`coverage-${i}`));
  const s = initialState();
  s.outcomes = c.slice(unseenCount).map((item, i) => ({
    id: `old-${i}`, sessionId: "old", questionId: item.id, revision: 1,
    bookId: item.book_id, day: "2026-10-20", time: Date.parse("2026-10-20T12:00:00Z"),
    correct: false, stage: 2, points: 1,
  }));
  return { c, s };
}
test("mixed practice reserves unseen coverage despite overdue review backlog", () => {
  const {c,s} = coverageFixture(100);
  const prior = JSON.stringify(s.outcomes);
  act(s, action("start", {clientId: "test"}), c, now);
  const selected = s.session!.questions;
  assert.equal(selected.length, 12);
  assert.equal(selected.filter(item => !s.outcomes.some(o => o.questionId === item.id)).length, 7);
  assert.equal(new Set(selected.map(item => item.id)).size, 12);
  assert.equal(JSON.stringify(s.outcomes), prior);
});
test("coverage pace increases near deadline but retains two review questions", () => {
  const {c,s} = coverageFixture(100);
  act(s, action("start", {clientId: "test"}), c, Date.parse("2030-12-30T16:00:00Z"));
  assert.equal(s.session!.questions.filter(item => !s.outcomes.some(o => o.questionId === item.id)).length, 10);
});
test("coverage fills unused new slots with review and supports all-new catalogs", () => {
  const {c,s} = coverageFixture(2);
  act(s, action("start", {clientId: "test"}), c, now);
  assert.equal(s.session!.questions.length, 12);
  assert.equal(s.session!.questions.filter(item => !s.outcomes.some(o => o.questionId === item.id)).length, 2);
  const fresh = initialState();
  act(fresh, action("start", {clientId: "test"}), c, now);
  assert.equal(fresh.session!.questions.length, 12);
});

test("explicit aliases accept reviewed wording in synthetic question fixtures", () => {
  for (const [id, book_id, answer, submitted] of [
    ["story05-005", "story05", "Chopping wood", "chop wood"],
    ["story05-006", "story05", "A car mechanic", "mechanic"],
    ["story04-003", "story04", "Madison", "maddy"],
    ["story01-017", "story01", "Half of it", "half of it"],
  ]) {
    const item = {...q(id), book_id, answer, accepted_answer_variants:[answer, submitted]};
    const s = initialState();
    act(s, action("start", {bookId:book_id,clientId:"test"}), [item], now);
    act(s, action("answer", {answer:submitted,clientId:"test"}), [item], now);
    assert.equal(s.outcomes[0]?.correct,true,id);
    assert.equal(s.outcomes[0]?.points,10,id);
  }
});
test("paintbrush articles and plurals pass but numbers and wrong objects do not", () => {
  const item={...q(),question:"What tool does she use?",answer:"A paintbrush",accepted_answer_variants:["A paintbrush"]};
  for(const answer of ["paintbrush","the paintbrush","paintbrushes","a paintbrush"]) {
    const s=start([item]);act(s,action("answer",{answer,clientId:"test"}),[item],now);
    assert.equal(s.outcomes[0]?.correct,true,answer);
  }
  for(const answer of ["two paintbrushes","not a paintbrush","paint"]) {
    const s=start([item]);act(s,action("answer",{answer,clientId:"test"}),[item],now);
    assert.equal(s.outcomes.length,0,answer);
  }
});
