---
name: steward
description: How a change reaches main in Bull Valley Shadow Wars — open a PR, drive its CI green, fix flaky tests on the way, keep the e2e shards even, and merge only when green. Read before opening, driving, or merging a pull request, and on every CI or review event on one.
---

# Stewarding a pull request

1. **Never commit or push to `main`.** Every change, however small (a typo, a docs line, a CI tweak), goes on a branch and reaches `main` through a pull request.
2. **Always open the PR.** When the work is done and pushed, open the PR yourself; don't stop at a pushed branch.
3. **Fix all CI.** Red on the PR's current head is yours to fix and push, whatever it is: format, lint, migrations, types, unit coverage floors, build, any e2e shard. A failure that looks unrelated to the diff still blocks the merge: fix it in the PR (it is not widening the PR) unless it is red on `main` too, in which case say so on the PR and port the fix if one exists.
4. **Merge when green.** Once CI has finished and passed on the current head and there is no merge conflict, squash-merge the PR (the repo allows no merge commits). Never merge before CI has finished, never on red, never on a head CI has not run on, even when asked to "merge it": that means drive it green, then merge. Nothing on `main` enforces this, so it is on you.
5. **Fix flaky tests opportunistically.** A test that fails and then passes on the same commit is a bug in the test (or the game), not noise. When you meet one, in this PR's CI or a run you read, make it robust in the same PR: wait on a real signal (`window.__bv`, a state in `__bv`, a frame) instead of a timeout or a button's text, drop order assumptions, seed what it relies on. Note the fix in the PR description. Never skip, retry-wrap, disable, or quarantine a test to get green.
6. **Keep the three e2e shards about the same duration.** After the e2e shards run, read `E2E shard balance` in the run summary (`scripts/e2e-balance.mjs`; docs/testing.md, "E2E shards"). When it warns, or one shard runs clearly longest, even them out in the same PR: split a heavy spec file in two, move a serial describe so file order deals it differently, or trim a slow boot that tests share. A PR that adds an e2e spec checks the balance before it merges.

Re-running a job is for a failure that died before any test ran (checkout, install, runner loss), at most once; a second failure is real.
