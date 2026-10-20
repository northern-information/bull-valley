// Reports how evenly the e2e shards split the suite, from the run's own job
// timings (`gh api repos/{repo}/actions/runs/{id}/jobs` on stdin). The e2e
// stage takes as long as its slowest shard, so a shard well over the others
// is wasted wall time. It warns past BALANCE and never fails: timings jitter
// on shared runners, and a red CI run would hold back the deploy.
// `node scripts/e2e-balance.mjs < jobs.json`

import { appendFileSync, readFileSync } from 'node:fs'

// The slowest shard's test step over the fastest's, past which it warns.
const BALANCE = 1.25
const SHARD_JOB = /^E2E tests \((\d+)\/(\d+)\)$/
const TEST_STEP = 'Run the shard'

const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000

const { jobs } = JSON.parse(readFileSync(0, 'utf8'))
const shards = jobs
  .map((job) => ({ job, match: SHARD_JOB.exec(job.name) }))
  .filter(({ match }) => match)
  .map(({ job, match }) => {
    const step = job.steps.find((s) => s.name === TEST_STEP)
    return {
      shard: `${match[1]}/${match[2]}`,
      seconds: step?.completed_at
        ? seconds(step.started_at, step.completed_at)
        : NaN,
    }
  })
  .sort((a, b) => a.shard.localeCompare(b.shard, 'en', { numeric: true }))

const timed = shards.filter((s) => Number.isFinite(s.seconds))
if (timed.length < 2) {
  console.log(`Only ${timed.length} timed e2e shard(s); nothing to compare.`)
  process.exit(0)
}

const slowest = Math.max(...timed.map((s) => s.seconds))
const fastest = Math.min(...timed.map((s) => s.seconds))
const ratio = slowest / fastest
const even = ratio <= BALANCE

const rows = shards.map(
  (s) =>
    `| ${s.shard} | ${Number.isFinite(s.seconds) ? `${s.seconds}s` : '—'} |`
)
const verdict = even
  ? `Even: the slowest shard took ${ratio.toFixed(2)}x the fastest (warns past ${BALANCE}x).`
  : `Uneven: the slowest shard took ${ratio.toFixed(2)}x the fastest (warns past ${BALANCE}x). See docs/testing.md, "E2E shards".`
const report = [
  '## E2E shard balance',
  '',
  '| shard | tests |',
  '|---|---|',
  ...rows,
  '',
  verdict,
  '',
].join('\n')

console.log(report)
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)
if (!even) console.log(`::warning title=E2E shards uneven::${verdict}`)
