import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  manifest = JSON.parse(
    readFileSync(new URL("content/approved/manifest.json", root)),
  );
const retired = new Set(
  JSON.parse(readFileSync(new URL("content/retired-questions.json", root))).ids,
);
const questions = [],
  seen = new Set();
for (const item of manifest.packets) {
  const raw = readFileSync(new URL("content/approved/" + item.file, root));
  if (createHash("sha256").update(raw).digest("hex") !== item.sha256)
    throw Error("Approved content changed: " + item.file);
  const packet = JSON.parse(raw);
  if (packet.status !== "approved") throw Error("Unapproved packet");
  for (const q of packet.questions) {
    if (
      seen.has(q.id) ||
      q.choices.length !== 4 ||
      q.choices.filter((c) => c.correct).length !== 1 ||
      !q.accepted_answer_variants.length
    )
      throw Error("Invalid question " + q.id);
    seen.add(q.id);
    if (retired.has(q.id)) continue;
    questions.push({
      ...q,
      choices: q.choices.map((c, i) => ({ ...c, id: String(i) })),
      book_id: packet.book_id,
    });
  }
}
writeFileSync(new URL("server/catalog.json", root), JSON.stringify(questions));
console.log(
  `Validated ${questions.length} approved questions; server-only catalog ready.`,
);
