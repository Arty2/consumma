#!/usr/bin/env bash
#
# Build gates from §6 and §13 of the build plan, so the rules that matter are
# enforced by CI rather than only written down.
#
# Every search is scoped to the directories being policed — never to scripts/ —
# because this file necessarily contains the strings it looks for.

set -uo pipefail

cd "$(dirname "$0")/.."

status=0

fail() {
	status=1
	printf '  FAIL  %s\n' "$1"
	printf '%s\n' "$2" | sed 's/^/        /'
}

pass() {
	printf '    ok  %s\n' "$1"
}

# ── 1. No route from a string to markup ──────────────────────────────────────
# The app holds a secret in the browser; one successful injection exfiltrates it
# and every list it opens. Svelte escapes interpolated text by default and
# nothing here ever needs to bypass that.
sinks=$(grep -rnF \
	-e '{@html' \
	-e 'innerHTML' \
	-e 'outerHTML' \
	-e 'insertAdjacentHTML' \
	-e 'eval(' \
	-e 'new Function(' \
	-e 'document.write' \
	-e 'dangerouslySet' \
	src 2>/dev/null)

if [ -n "$sinks" ]; then
	fail "markup/script sink in src/" "$sinks"
else
	pass "no markup or script sinks in src/"
fi

# ── 2. Server code never touches key material ────────────────────────────────
# All encryption and decryption happens in the browser. The server sees
# ciphertext and a room id, and must not be able to see anything else.
server_paths=""
[ -d src/routes/api ] && server_paths="src/routes/api"
[ -d src/lib/server ] && server_paths="$server_paths src/lib/server"

if [ -n "$server_paths" ]; then
	# An import, not a mention: the modules below discuss why they must not
	# depend on the crypto module, and prose is not a dependency.
	# shellcheck disable=SC2086
	leak=$(grep -rnE "(from|import|require)[[:space:]]*\(?[[:space:]]*['\"][^'\"]*lib/crypto" \
		$server_paths 2>/dev/null)
	if [ -n "$leak" ]; then
		fail "server code imports from src/lib/crypto" "$leak"
	else
		pass "server code does not import src/lib/crypto"
	fi
else
	pass "no server code yet"
fi

# ── 3. No secret-shaped name is exposed to the browser ───────────────────────
# $env/static/public is inlined into the client bundle. A PUBLIC_ variable
# holding a token, a secret, a key — or a blob base URL — is a shipped secret.
public=$(grep -rnE 'PUBLIC_[A-Z0-9_]*(TOKEN|SECRET|KEY|BLOB)' \
	src .github vercel.json 2>/dev/null)

if [ -n "$public" ]; then
	fail "PUBLIC_ variable name looks like a secret" "$public"
else
	pass "no secret-shaped PUBLIC_ names"
fi

# ── 4. No image files of any kind ────────────────────────────────────────────
# Every mark in the app is type or an inline SVG path generated in code. The
# only binary in the repo is the woff2 face; the PWA's raster
# icons are drawn and rasterised at build time, never committed.
assets=$(find src static -type f -not -path 'static/icons/*' \( \
	-iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.gif' \
	-o -iname '*.webp' -o -iname '*.avif' -o -iname '*.bmp' -o -iname '*.tif' \
	-o -iname '*.tiff' -o -iname '*.ico' \
	-o -iname '*.eot' -o -iname '*.ttf' -o -iname '*.otf' -o -iname '*.woff' \
	\) 2>/dev/null)

if [ -n "$assets" ]; then
	fail "raster asset or non-woff2 font committed" "$assets"
else
	pass "no raster assets or icon fonts"
fi

# static/icons is the one exception, and only because the build draws it. The
# exemption is worth nothing unless the directory is also ignored by git —
# otherwise it becomes the place to hide a committed image.
if grep -q '^/static/icons$' .gitignore 2>/dev/null; then
	pass "generated icons are gitignored"
else
	fail "static/icons is exempt from the asset gate but is not gitignored" \
		"add /static/icons to .gitignore"
fi

# ── 5. Nothing that the sketch does not have ─────────────────────────────────
# A shadow means grey, and grey does not exist here. An <img> or a
# background-image means an asset, and the app has none.
chrome=$(grep -rnF \
	-e 'box-shadow' \
	-e '<img' \
	src 2>/dev/null)

if [ -n "$chrome" ]; then
	fail "shadow or <img> in src/" "$chrome"
else
	pass "no shadows or <img> elements"
fi

# A background-image means an asset, and the app has none — with one exception.
# The mark under a link has to repeat per line box, which is the one thing an
# inline <svg> cannot do, so it is a tile drawn by src/lib/draw and handed over
# as a custom property. That exact form is allowed and nothing else is: no
# url(), no gradient, no file.
backgrounds=$(grep -rn 'background-image' src 2>/dev/null |
	grep -v 'background-image: var(--underline);')

if [ -n "$backgrounds" ]; then
	fail "background-image in src/ that is not the drawn link underline" "$backgrounds"
else
	pass "no background-images but the drawn link underline"
fi

if [ "$status" -ne 0 ]; then
	printf '\ngates failed\n'
fi

exit "$status"
