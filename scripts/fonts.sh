#!/usr/bin/env bash
#
# Copies the latin-subset woff2 face out of its @fontsource package into
# static/fonts, where the app serves it from its own origin.
#
# One face, everywhere. To use a different one, put its woff2 in static/fonts
# by hand and point the single @font-face in src/app.css at it — this script
# only exists because @fontsource keeps the OFL faces current.
#
# The files are committed rather than generated at install time, so a clone
# builds correctly without depending on install scripts having run. Rerun this
# after bumping either @fontsource dependency.
#
# The face is SIL OFL; the licence travels with it.

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

printf 'fonts copied\n'
