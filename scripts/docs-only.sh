#!/usr/bin/env sh
# Whether a change touches only the docs (every *.md, anywhere), so CI
# can skip the build and the e2e shards for it: they report green at once
# instead of running. Format, lint, types and the unit tests still run on
# every change, since prettier checks the docs and the module map test
# reads CLAUDE.md. Prints `docs-only=true` or `docs-only=false` for
# $GITHUB_OUTPUT. Anything it cannot tell (no base, a diff that fails, no
# files) counts as code, so the full run is never skipped by mistake.
#
#   scripts/docs-only.sh <base-sha> <head-sha>
set -u
cd "$(dirname "$0")/.."
answer() {
  echo "docs-only=$1"
  exit 0
}
[ -n "${1:-}" ] && [ -n "${2:-}" ] || answer false
files=$(git diff --name-only "$1...$2") || answer false
[ -n "$files" ] || answer false
for file in $files; do
  case "$file" in
    *.md) ;;
    *) answer false ;;
  esac
done
answer true
