#!/usr/bin/env bash
#
# Copies the latin-subset woff2 faces out of the @fontsource packages into
# static/fonts, where the app serves them from its own origin.
#
# The files are committed rather than generated at install time, so a clone
# builds correctly without depending on install scripts having run. Rerun this
# after bumping either @fontsource dependency.
#
# Both faces are SIL OFL; the licences travel with them.

set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p static/fonts

copy() {
	local package="$1" file="$2"
	cp "node_modules/@fontsource/${package}/files/${file}" "static/fonts/${file}"
	cp "node_modules/@fontsource/${package}/LICENSE" "static/fonts/${package}-OFL.txt"
	printf '  %s\n' "static/fonts/${file}"
}

copy patrick-hand patrick-hand-latin-400-normal.woff2
copy caveat caveat-latin-400-normal.woff2

printf 'fonts copied\n'
