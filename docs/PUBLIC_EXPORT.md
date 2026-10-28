# Public-export record

Prepared October 28, 2026 from an explicit source-file allowlist, with a new Git history.

## Excluded

The private repository history, local backup bundles, environment files, access scripts, deployment settings, database files, learner history, teacher packets, review artifacts, book summaries and covers, private schedule, and character mascot were not exported. The public README does not link to the live family app. Article screenshots of real progress stay in the author's private writing workspace; only a sample-data screenshot is included here.

## Replaced

- Learner identity: R, clearly labeled as a sample learner.
- Content: ten original short stories and forty authored sample questions.
- Art: original compass SVG and plain text/emoji story covers.
- State: empty local sample progress.
- Hosting: loopback-only SQLite runner without deployment scripts.
- Private grading patches: explicit synthetic aliases in tests.
- Practice target: an illustrative 2030 date in a separate setting.

## Checks

A public-export scan checks forbidden paths, private names/URLs, common credential formats, external book-art hosts and local database files outside ignored build/runtime folders. Manually reviewed source files, docs, package metadata and the repository screenshot. Automated checks are useful but do not prove the absence of every possible issue.

The sample parent PIN in `server/local.ts` is intentionally public and only for this local demo. Test credentials are synthetic fixtures. Never use either for a hosted service.
