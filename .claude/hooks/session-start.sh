#!/bin/bash
# Readies a Claude Code cloud session: dependencies, the generated Worker
# types, and the dev server's local accounts database (docs/tooling.md).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install rather than npm ci: it reuses the cached node_modules.
# --no-save keeps it from rewriting package-lock.json.
npm install --no-audit --no-fund --no-save

# worker-configuration.d.ts, which typecheck and lint also regenerate.
npm run types

# The dev server's D1 (npm run dev); e2e applies its own in --mode test.
npm run db:migrate

# The container ships Playwright's browsers for an older Playwright than
# the one package.json pins, so fetch the build this one launches. It
# skips the download once that build is there.
npx playwright install chromium
