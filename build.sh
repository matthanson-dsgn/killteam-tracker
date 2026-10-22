#!/usr/bin/env bash
#
# build.sh — copy the files needed to run the app into ./deploy, ready to
# publish as a static site (Netlify Drop, GitHub Pages, ...).
#
# No build tools are needed: the app is plain HTML/CSS/JS. This script just
# copies the runtime files and makes a few deploy-only tweaks:
#   1. Stamps sw.js with a cache version based on the file contents, so
#      installed phones always pick up a new deploy (no manual bump needed).
#   2. Adds <base href="BASE_PATH"> to index.html so assets load from the
#      app's root even if the page is opened at a nested URL.
#   3. Adds fallbacks so unknown URLs show the app instead of a 404:
#      _redirects (Netlify) and 404.html (GitHub Pages).
#
# Usage:
#   ./build.sh                                  # site served from the root, e.g. Netlify
#   BASE_PATH=/killteam-tracker/ ./build.sh     # GitHub Pages project site
set -euo pipefail

cd "$(dirname "$0")"
OUT=deploy

# Where the app lives on the server; must start and end with "/".
BASE_PATH="${BASE_PATH:-/}"
case "$BASE_PATH" in
  /*/ | /) ;;
  *) echo "BASE_PATH must start and end with '/', e.g. /killteam-tracker/ (got '$BASE_PATH')" >&2; exit 1 ;;
esac

# Everything the app needs at runtime — add new files here.
FILES=(
  index.html
  manifest.webmanifest
  sw.js
  css/styles.css
  js/data/killTeams.js
  js/store.js
  js/app.js
  icons/icon.svg
  icons/icon-192.png
  icons/icon-512.png
)

rm -rf "$OUT"
mkdir -p "$OUT"

for f in "${FILES[@]}"; do
  mkdir -p "$OUT/$(dirname "$f")"
  cp "$f" "$OUT/$f"
done

# 1. Content-hash cache version (first 10 chars of a hash of all files)
HASH=$(cd "$OUT" && cat "${FILES[@]}" | shasum -a 256 | cut -c1-10)
sed -i.bak "s/const CACHE_VERSION = '[^']*';/const CACHE_VERSION = 'ktst-$HASH';/" "$OUT/sw.js"

# 2. Resolve all relative asset paths (CSS, JS, manifest, sw.js) from BASE_PATH
sed -i.bak "s|<meta charset=\"utf-8\">|<meta charset=\"utf-8\"> <base href=\"$BASE_PATH\">|" "$OUT/index.html"

rm -f "$OUT"/*.bak

# 3. Show the app for unknown URLs instead of a 404
printf '/*  %sindex.html  200\n' "$BASE_PATH" > "$OUT/_redirects"   # Netlify
cp "$OUT/index.html" "$OUT/404.html"                                 # GitHub Pages

echo "Built $OUT/ for $BASE_PATH (cache version ktst-$HASH):"
(cd "$OUT" && find . -type f | sort | sed 's|^\./|  |')
