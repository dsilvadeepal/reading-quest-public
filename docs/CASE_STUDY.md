# Reading Quest: product decisions

## Start with an existing task

The private app grew around a real reading-practice routine. The public edition preserves the UI and practice engine while replacing the source material with original, deliberately simple sample stories. It is an implementation example, not a ready-made curriculum.

## Let the learner influence the experience

Visible progress, badges and color choices were part of the original product discussion. The public edition retains the red visual design and adds an original compass mascot in place of the private app's character illustration.

## Treat grading as a product rule

A strict text comparison can reject an acceptable response. Bounded normalization, reviewed aliases and regression tests make that behavior inspectable. Broad fuzzy matching can also accept a wrong answer, so tests protect negations, quantities, required names and meaning-changing variations. The public edition uses explicit synthetic aliases rather than private question-specific patches.

## Preserve effort when making corrections

Fixing future grading and repairing earlier scores are separate operations. The learning app supports flags and read-only reporting. It does not provide an automatic parent acceptance or score-repair workflow. Any extension should bind a correction to specific outcomes, preserve unrelated progress, and record the reason.

## Keep human review visible

A parent who knows the material can review a flagged answer. That is real work and may not scale to a classroom. This project does not claim to replace a teacher or assess learning gains.

## Public-edition limits

- One local sample learner; no hosted multi-user accounts.
- Forty original sample questions, not the private teacher packets.
- No real progress seeded into the repository.
- Typed answers work without credentials; provider transcription is disabled.
- A local demo is not hardened for public hosting.

Built with AI-assisted implementation and human product direction, review and testing.
