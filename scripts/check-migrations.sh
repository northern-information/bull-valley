#!/usr/bin/env sh
# Migrations only add. A DROP or a RENAME in migrations/*.sql would break
# the Worker still running while the next one ships, so CI and the deploy
# fail on one. Case does not matter; a comment counts too, so keep the
# words out of them. The frozen 0007 pair's file names are guarded by
# tests/unit/migrations.test.ts, not here.
set -eu
cd "$(dirname "$0")/.."
if grep -Eil '(^|[^a-z_])(drop|rename) ' migrations/*.sql; then
  echo 'A migration above drops or renames; migrations only add.' >&2
  exit 1
fi
echo 'Every migration only adds.'
