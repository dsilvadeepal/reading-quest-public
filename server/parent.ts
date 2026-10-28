import type { State, Question, Outcome } from "../shared/types";
import { books, badgeDefinitions } from "../shared/books";
import { localDay, masterDays } from "./engine";
export function parentReport(s: State, catalog: Question[], now: number) {
  const current = new Map(catalog.map((q) => [q.id, q]));
  const eligible = s.outcomes.filter(
    (o) => current.get(o.questionId)?.revision === o.revision,
  );
  const summary = (rows: Outcome[]) => ({
    answered: rows.length,
    independent: rows.filter((o) => o.correct && o.stage === 0).length,
    hinted: rows.filter((o) => o.correct && o.stage === 1).length,
    choices: rows.filter((o) => o.correct && o.stage === 2).length,
    missed: rows.filter((o) => !o.correct).length,
  });
  const anchor = Date.parse(localDay(now) + "T12:00:00Z");
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(anchor - (6 - i) * 86400000).toISOString().slice(0, 10),
  );
  const practiceDays = new Set([
    ...(s.practiceDays || []),
    ...s.outcomes.map((o) => o.day),
  ]);
  const calendar = days.map((day) => ({
    day,
    practiced: practiceDays.has(day),
    seconds: s.dailySeconds?.[day] || 0,
    timeKnown: s.trackingSince !== undefined && day > localDay(s.trackingSince),
  }));
  const latestAll = new Map<string, Outcome>();
  for (const o of eligible)
    if (
      !latestAll.has(o.questionId) ||
      latestAll.get(o.questionId)!.time <= o.time
    )
      latestAll.set(o.questionId, o);
  return {
    asOf: now,
    points: s.points,
    activeSeconds: s.activeSeconds,
    completed: s.completed.length,
    totals: summary([...latestAll.values()]),
    historicalAnswers: s.outcomes.length - eligible.length,
    activeDays: practiceDays.size,
    week: {
      days: calendar.filter((d) => d.practiced).length,
      calendar,
      activeSeconds: calendar.reduce((n, d) => n + d.seconds, 0),
      completeTime: calendar.every((d) => d.timeKnown),
      completed: s.completed.filter((c) => days.includes(c.day)).length,
    },
    badges: badgeDefinitions.filter((b) => s.badges[b.id]).map((b) => b.name),
    lastPractice:
      Math.max(s.lastPracticedAt || 0, ...s.outcomes.map((o) => o.time)) ||
      null,
    session:
      s.session && s.session.index < s.session.questions.length
        ? { question: s.session.index + 1, total: s.session.questions.length }
        : null,
    books: books.map((b) => {
      const qs = catalog.filter((q) => q.book_id === b.id);
      const rows = eligible.filter((o) => o.bookId === b.id);
      const latest = new Map(
        [...latestAll].filter(([, o]) => o.bookId === b.id),
      );
      return {
        id: b.id,
        title: b.title,
        read: !!s.read[b.id],
        available: qs.length,
        covered: latest.size,
        ...summary([...latest.values()]),
        masterDays: masterDays(s, catalog, b.id).length,
        review: [...latest.values()]
          .filter((o) => !o.correct || o.stage > 0)
          .map((o) => ({
            number: current.get(o.questionId)!.teacher_number,
            question: current.get(o.questionId)!.question,
            support: o.correct
              ? o.stage === 1
                ? "Needed a hint"
                : "Needed choices"
              : "Answer revealed",
          })),
      };
    }),
  };
}
