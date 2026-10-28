import { SAMPLE_PRACTICE_DEADLINE } from "../shared/demo-settings";
import { retiredQuestionIds } from "../shared/retired-questions";
import { bookSummaries } from "./book-summaries";
import { books, badgeDefinitions } from "../shared/books";
import type { State, Question, Action, Outcome } from "../shared/types";
export function localDay(now: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const dayAdd = (day: string, n: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function normalize(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([+\-−])\s*(?=\d)/g, (_m, sign) =>
      sign === "+" ? " numericplus " : " numericminus ",
    )
    .replace(/(?<=\d)[.,](?=\d)/g, (m) =>
      m === "." ? " decimalpoint " : " numericcomma ",
    )
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Parent-approved wording tolerance. Do not broadly stem names or discard meaningful words.
const nounForms: Record<string, string> = Object.fromEntries(
  [
    ["rule", "rules"],
    ["footstep", "footsteps"],
    ["sound", "sounds"],
    ["noise", "noises"],
    ["animal", "animals"],
    ["mirror", "mirrors"],
    ["mask", "masks"],
    ["book", "books"],
    ["brush", "brushes"],
    ["paintbrush", "paintbrushes"],
    ["painting", "paintings"],
    ["key", "keys"],
    ["door", "doors"],
    ["window", "windows"],
    ["feather", "feathers"],
    ["coin", "coins"],
    ["egg", "eggs"],
    ["match", "matches"],
    ["tool", "tools"],
    ["clue", "clues"],
    ["letter", "letters"],
    ["picture", "pictures"],
  ].flatMap(([singular, plural]) => [
    [singular, singular],
    [plural, singular],
  ]),
);
export function wordingNormalize(
  value: string,
  q: Pick<Question, "book_id" | "question">,
): string {
  let words = normalize(value).split(" ");
  if (["a", "an", "the"].includes(words[0]) && words.length > 1) words.shift();
  if (q.book_id === "story04")
    words = words.map((w) =>
      ["maddie", "maddy"].includes(w) ? "madison" : ["maddies", "maddys"].includes(w) ? "madisons" : w,
    );
  // Quantity-sensitive questions retain noun number, including spelled-out quantities.
  const quantity =
    /\d|\b(how many|number of|single|exactly|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
  if (!quantity.test(q.question) && !quantity.test(value))
    words = words.map((w) => nounForms[w] || w);
  return words.join(" ");
}
// Small spelling slips are allowed, but never missing words, numbers, or short words.
export function spellingMatch(answer: string, expected: string): boolean {
  const a = normalize(answer).split(" ");
  const b = normalize(expected).split(" ");
  if (a.length !== b.length) return false;
  let total = 0;
  return a.every((word, index) => {
    const target = b[index];
    if (word === target) return true;
    if (Math.min(word.length, target.length) < 5 || /\d/.test(word + target))
      return false;
    const rows = Array.from({ length: word.length + 1 }, (_, i) =>
      Array.from({ length: target.length + 1 }, (_, j) =>
        i === 0 ? j : j === 0 ? i : 0,
      ),
    );
    for (let i = 1; i <= word.length; i++) {
      for (let j = 1; j <= target.length; j++) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (word[i - 1] === target[j - 1] ? 0 : 1),
        );
        if (
          i > 1 &&
          j > 1 &&
          word[i - 1] === target[j - 2] &&
          word[i - 2] === target[j - 1]
        )
          rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
    const distance = rows[word.length][target.length];
    total += distance;
    return distance <= 1 && total <= 2;
  });
}
// Retire only queued questions. Completed outcomes/rewards and prior positions stay intact.
export function retireQueuedQuestions(s: State): boolean {
  const p = s.session;
  if (
    !p ||
    !p.questions.slice(p.index).some((q) => retiredQuestionIds.has(q.id))
  )
    return false;
  const currentRemoved = retiredQuestionIds.has(p.questions[p.index].id);
  p.questions = [
    ...p.questions.slice(0, p.index),
    ...p.questions.slice(p.index).filter((q) => !retiredQuestionIds.has(q.id)),
  ];
  if (p.index >= p.questions.length) {
    complete(s, Date.now());
    s.session = null;
  } else if (currentRemoved) {
    p.stage = 0;
    p.revealed = false;
  }
  return true;
}
export function initializeTracking(s: State, now: number): boolean {
  if (s.trackingSince !== undefined && s.badgeSeen !== undefined) return false;
  s.badgeSeen ??= Object.keys(s.badges);
  s.trackingSince ??= now;
  s.dailySeconds ??= {};
  s.practiceDays ??= [...new Set(s.outcomes.map((o) => o.day))];
  return true;
}
export function initialState(): State {
  return {
    version: 0,
    points: 0,
    activeSeconds: 0,
    read: Object.fromEntries(books.map((b) => [b.id, b.read])),
    readingConfirmed: false,
    outcomes: [],
    badges: {},
    completed: [],
    session: null,
    requests: [],
    disputes: [],
  };
}
export function masterDays(s: State, catalog: Question[], book: string) {
  const qs = catalog.filter((q) => q.book_id === book);
  if (!qs.length) return [];
  const days = new Set(
    s.outcomes.filter((o) => o.bookId === book).map((o) => o.day),
  );
  return [...days].filter((day) => {
    const first = qs.map((q) =>
      s.outcomes.find(
        (o) =>
          o.day === day && o.questionId === q.id && o.revision === q.revision,
      ),
    );
    return (
      first.every(Boolean) &&
      first.filter((o) => o!.correct && o!.stage === 0).length / qs.length >=
        0.9
    );
  });
}
function streak(s: State, now: number) {
  const days = [...new Set(s.completed.map((c) => c.day))].sort().reverse();
  let current = localDay(now);
  if (!days.includes(current)) current = dayAdd(current, -1);
  let n = 0;
  while (days.includes(current)) {
    n++;
    current = dayAdd(current, -1);
  }
  return n;
}
function award(s: State, catalog: Question[], now: number) {
  const add = (id: string, yes: boolean) => {
    if (yes && !s.badges[id]) s.badges[id] = localDay(now);
  };
  for (const b of books)
    add("master-" + b.id, masterDays(s, catalog, b.id).length >= 2);
  for (const n of [1, 3, 5, 10])
    add(
      "read-" + n,
      s.readingConfirmed && Object.values(s.read).filter(Boolean).length >= n,
    );
  const masters = Object.keys(s.badges).filter((x) =>
    x.startsWith("master-"),
  ).length;
  for (const n of [2, 10]) add("masters-" + n, masters >= n);
  for (const n of [3, 5, 7, 14]) add("streak-" + n, streak(s, now) >= n);
  for (const n of [30, 60, 120, 300])
    add("minutes-" + n, s.activeSeconds >= n * 60);
  add("first", s.completed.length > 0);
  add("sessions", s.completed.length >= 10);
  const unaided = s.outcomes.filter((o) => o.correct && o.stage === 0);
  for (const n of [10, 50])
    add("recall-" + n, new Set(unaided.map((o) => o.questionId)).size >= n);
  add(
    "comeback",
    unaided.some((o) =>
      s.outcomes.some(
        (p) =>
          p.questionId === o.questionId &&
          p.revision === o.revision &&
          p.sessionId !== o.sessionId &&
          p.time < o.time &&
          !p.correct,
      ),
    ),
  );
  add(
    "mix",
    s.outcomes.some(
      (o) =>
        new Set(
          s.outcomes
            .filter((p) => p.sessionId === o.sessionId)
            .map((p) => p.bookId),
        ).size >= 3,
    ),
  );
}
function last(s: State, q: Question) {
  return s.outcomes
    .filter((o) => o.questionId === q.id && o.revision === q.revision)
    .at(-1);
}
function due(s: State, q: Question) {
  const o = last(s, q);
  if (!o) return "";
  let interval = 1;
  if (o.correct && o.stage === 0) {
    let count = 0;
    const history = s.outcomes.filter(
      (x) => x.questionId === q.id && x.revision === q.revision,
    );
    for (const x of [...history].reverse()) {
      if (!x.correct || x.stage !== 0) break;
      count++;
    }
    interval = [1, 3, 7, 14][Math.min(count - 1, 3)];
  }
  return dayAdd(o.day, interval);
}
function select(
  s: State,
  c: Question[],
  book: string | undefined,
  now: number,
) {
  const day = localDay(now);
  const rank = (q: Question) => {
    const d = due(s, q);
    return d && d <= day ? 0 : !d ? 1 : 2;
  };
  const sorted = c
    .filter((q) => !book || q.book_id === book)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (last(s, a)?.time ?? 0) - (last(s, b)?.time ?? 0) ||
        a.id.localeCompare(b.id),
    );
  if (book) return sorted.slice(0, 12);
  const balanced = (pool: Question[], n: number) => {
    const chosen: Question[] = [];
    while (pool.length && chosen.length < n) {
      pool.sort(
        (a, b) =>
          rank(a) - rank(b) ||
          chosen.filter((q) => q.book_id === a.book_id).length -
            chosen.filter((q) => q.book_id === b.book_id).length,
      );
      chosen.push(pool.shift()!);
    }
    return chosen;
  };
  // Reserve unseen coverage before due reviews can consume every slot.
  // Pace assumes two completed mixed quests daily through the configurable sample deadline.
  const unseen = sorted.filter((q) => !last(s, q));
  const seen = sorted.filter((q) => last(s, q));
  const daysLeft = Math.max(
    1,
    Math.floor((Date.parse(SAMPLE_PRACTICE_DEADLINE + "T12:00:00Z") - Date.parse(day + "T12:00:00Z")) / 86400000) + 1,
  );
  const newTarget = Math.min(10, Math.max(7, Math.ceil(unseen.length / (daysLeft * 2))));
  const fresh = balanced([...unseen], newTarget);
  const review = balanced([...seen], 12 - fresh.length);
  const selected = [...fresh, ...review];
  // With no review history, fill the quest with new questions instead.
  const extra = balanced(unseen.filter((q) => !fresh.includes(q)), 12 - selected.length);
  // Interleave new and review questions instead of grouping them by type.
  const mixed: Question[] = [];
  const newQuestions = [...fresh, ...extra];
  while (newQuestions.length || review.length) {
    if (newQuestions.length) mixed.push(newQuestions.shift()!);
    if (review.length) mixed.push(review.shift()!);
  }
  return mixed;
}
function complete(s: State, now: number) {
  const p = s.session;
  if (!p) return;
  const count = p.results.length;
  if (
    count >= Math.min(5, p.questions.length) &&
    count > 0 &&
    !s.completed.some((c) => c.id === p.id)
  )
    s.completed.push({
      id: p.id,
      day: localDay(now),
      count,
      pool: p.questions.length,
    });
}
export function act(s: State, a: Action, catalog: Question[], now: number) {
  if (!a.requestId || a.requestId.length > 100)
    throw Error("Missing request identifier.");
  if (s.requests.includes(a.requestId)) return;
  initializeTracking(s, now);
  if (a.type === "acknowledge-badges") {
    if (
      !Array.isArray(a.badgeIds) ||
      a.badgeIds.length > 100 ||
      a.badgeIds.some((id) => typeof id !== "string" || !s.badges[id])
    )
      throw Error("Choose earned badges.");
    s.badgeSeen = [...new Set([...(s.badgeSeen || []), ...a.badgeIds])];
  } else if (a.type === "badge-sound") {
    if (typeof a.muted !== "boolean") throw Error("Choose a sound setting.");
    s.badgeMuted = a.muted;
  } else if (a.type === "read") {
    if (!books.some((b) => b.id === a.bookId) || typeof a.read !== "boolean")
      throw Error("Choose a book.");
    s.read[a.bookId!] = a.read;
    if (a.read) s.readingConfirmed = true;
  } else if (a.type === "start" || a.type === "restart") {
    if (s.session && a.type !== "restart")
      throw Error("Resume or finish your current quest first.");
    if (!a.clientId) throw Error("This browser needs to reconnect.");
    const questions = select(s, catalog, a.bookId, now);
    if (!questions.length)
      throw Error("Questions are coming soon for this book.");
    if (a.type === "restart") complete(s, now);
    s.session = {
      id: crypto.randomUUID(),
      clientId: a.clientId,
      questions: structuredClone(questions).map((q) => ({
        ...q,
        choices: q.choices.map((c) => ({ ...c })),
      })),
      index: 0,
      stage: 0,
      revealed: false,
      started: now,
      heartbeat: now,
      activeLease: true,
      activeSeconds: 0,
      results: [],
      mode: a.bookId || "mix",
    };
    // Fisher-Yates shuffles independently of correct-choice position.
    for (const q of s.session.questions)
      for (let i = q.choices.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [q.choices[i], q.choices[j]] = [q.choices[j], q.choices[i]];
      }
  } else {
    const p = s.session;
    if (!p) throw Error("Start a quest first.");
    if (a.type === "resume") {
      if (!a.clientId) throw Error("Reconnect this browser.");
      p.clientId = a.clientId;
      p.heartbeat = now;
      p.activeLease = false;
    } else {
      if (p.clientId !== a.clientId)
        throw Error(
          "This quest is open on another device. Tap Resume here to continue.",
        );
      const q = p.questions[p.index];
      if (a.type === "answer") {
        if (p.revealed) throw Error("Continue to the next question.");
        let correct = false;
        if (p.stage < 2) {
          if (
            typeof a.answer !== "string" ||
            !normalize(a.answer) ||
            a.answer.length > 500
          )
            throw Error("Say or type an answer first.");
          const aliases = [...q.accepted_answer_variants];
          if (q.required_answer_parts?.length === 2) {
            aliases.push(
              q.required_answer_parts.join(" and "),
              [...q.required_answer_parts].reverse().join(" and "),
            );
          }
          const expected = aliases.map((v) => wordingNormalize(v, q));
          const submitted = wordingNormalize(a.answer!, q);
          const exact = expected.includes(submitted);
          const knownWrong = q.choices.some(
            (choice) =>
              !choice.correct && wordingNormalize(choice.text, q) === submitted,
          );
          correct =
            exact ||
            (!knownWrong && expected.some((v) => spellingMatch(submitted, v)));
        } else {
          const choice = q.choices.find((c) => c.id === a.choiceId);
          if (!choice) throw Error("Choose one of the four answers.");
          correct = choice.correct;
        }
        s.lastPracticedAt = now;
        s.practiceDays = [
          ...new Set([...(s.practiceDays || []), localDay(now)]),
        ];
        if (!correct && p.stage < 2) p.stage++;
        else {
          const day = localDay(now),
            already = s.outcomes.some(
              (o) =>
                o.questionId === q.id &&
                o.revision === q.revision &&
                o.day === day,
            );
          const points = already ? 0 : correct ? [10, 5, 3][p.stage] : 1;
          const o: Outcome = {
            id: a.requestId,
            sessionId: p.id,
            questionId: q.id,
            revision: q.revision,
            bookId: q.book_id,
            day,
            time: now,
            correct,
            stage: p.stage,
            points,
          };
          s.outcomes.push(o);
          p.results.push(o);
          s.points += points;
          p.revealed = true;
        }
      } else if (a.type === "next") {
        if (!p.revealed) throw Error("Finish this question first.");
        if (p.index === p.questions.length - 1) {
          complete(s, now);
          s.session = null;
        } else {
          p.index++;
          p.stage = 0;
          p.revealed = false;
        }
      } else if (a.type === "finish") {
        complete(s, now);
        s.session = null;
      } else if (a.type === "heartbeat") {
        const elapsed = now - p.heartbeat;
        if (
          a.active &&
          p.activeLease &&
          !a.resetClock &&
          elapsed >= 0 &&
          elapsed <= 20000
        ) {
          const increment = Math.min(15, Math.floor(elapsed / 1000));
          s.activeSeconds += increment;
          // Split credited whole seconds across local midnight without assuming 24h days.
          for (let sec = 0; sec < increment; sec++) {
            const day = localDay(now - (sec + 0.5) * 1000);
            s.dailySeconds![day] = (s.dailySeconds![day] || 0) + 1;
          }
          p.activeSeconds = (p.activeSeconds || 0) + increment;
        }
        p.activeLease = !!a.active;
        p.heartbeat = now;
      } else if (a.type === "dispute") {
        if (!a.answer?.trim() || a.answer.length > 500)
          throw Error("Enter the answer you want reviewed.");
        if (
          !s.disputes.some(
            (d) =>
              d.questionId === q.id &&
              d.revision === q.revision &&
              localDay(d.time) === localDay(now),
          )
        )
          s.disputes.push({
            questionId: q.id,
            revision: q.revision,
            text: a.answer,
            time: now,
          });
      } else throw Error("Unknown action.");
    }
  }
  s.disputes = s.disputes.filter((d) => now - d.time < 30 * 86400000);
  award(s, catalog, now);
  s.version++;
  s.requests.push(a.requestId);
  s.requests = s.requests.slice(-1000);
}
export function view(s: State, catalog: Question[], now: number): any {
  const p = s.session,
    q = p?.questions[p.index];
  let session = null;
  if (p && q)
    session = {
      id: p.id,
      clientId: p.clientId,
      index: p.index,
      total: p.questions.length,
      stage: p.stage,
      revealed: p.revealed,
      started: p.started,
      activeSeconds: p.activeSeconds || 0,
      mode: p.mode,
      results: p.results.map((o) => ({
        correct: o.correct,
        stage: o.stage,
        points: o.points,
      })),
      question: {
        id: q.id,
        bookId: q.book_id,
        number: q.teacher_number,
        text: q.question,
        ...(p.stage >= 1 ? { hint: q.hint } : {}),
        ...(p.stage >= 2
          ? { choices: q.choices.map((c) => ({ id: c.id, text: c.text })) }
          : {}),
        ...(p.revealed
          ? {
              answer: q.answer,
              explanation: q.explanation,
              correct: p.results.at(-1)?.correct,
              points: p.results.at(-1)?.points,
            }
          : {}),
      },
    };
  return {
    version: s.version,
    badgeMuted: !!s.badgeMuted,
    pendingBadges: badgeDefinitions
      .filter(
        (b) =>
          s.badges[b.id] &&
          s.badgeSeen !== undefined &&
          !s.badgeSeen.includes(b.id),
      )
      .map((b) => ({ ...b, earned: s.badges[b.id] })),
    points: s.points,
    activeMinutes: Math.floor(s.activeSeconds / 60),
    streak: streak(s, now),
    completed: s.completed.length,
    books: books.map((b) => {
      const qs = catalog.filter((q) => q.book_id === b.id);
      return {
        ...b,
        read: s.read[b.id],
        count: qs.length,
        attempted: qs.filter((q) => last(s, q)).length,
        masterDays: masterDays(s, catalog, b.id).length,
        introduction: bookSummaries[b.id].introduction,
        summarySources: s.read[b.id] ? bookSummaries[b.id].sources : [],
        recap: s.read[b.id]
          ? bookSummaries[b.id].recap
          : "Finish this book to unlock its full recap.",
      };
    }),
    badges: badgeDefinitions.map((b) => ({
      ...b,
      earned: s.badges[b.id] || null,
    })),
    session,
  };
}
