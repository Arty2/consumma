#!/usr/bin/env bash
#
# The JavaScript budget. A shared list opened in a shop with one bar of signal
# is the case that matters, so this is a hard limit rather than a target.
#
# Measured gzipped, over everything the browser downloads to run the app.

set -euo pipefail

cd "$(dirname "$0")/.."

BUDGET_KB=60
DIR=.svelte-kit/output/client/_app/immutable

if [ ! -d "$DIR" ]; then
	printf 'no build to measure — run pnpm build first\n' >&2
	exit 1
fi

total=0
while IFS= read -r file; do
	size=$(gzip -c "$file" | wc -c)
	total=$((total + size))
done < <(find "$DIR" -name '*.js' -type f)

kb=$((total / 1024))

printf '  %s KB of JavaScript, gzipped (budget %s KB)\n' "$kb" "$BUDGET_KB"

if [ "$kb" -gt "$BUDGET_KB" ]; then
	printf '\nover budget\n' >&2
	exit 1
fi
