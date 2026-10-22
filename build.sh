#!/usr/bin/env bash
#
# build.sh — copy the files needed to run the app into ./deploy, which the
# GitHub Actions workflow (.github/workflows/deploy.yml) publishes to
# GitHub Pages.
#
# No build tools are needed: the app is plain HTML/CSS/JS. This script just
# copies the runtime files and makes a few deploy-only tweaks:
#   1. Stamps sw.js with a cache version based on the file contents, so
#      installed phones always pick up a new deploy (no manual bump needed).
#   2. Adds <base href="BASE_PATH"> to index.html so assets load from the
#      app's root even if the page is opened at a nested URL.
#   3. Copies index.html to 404.html, so refreshing or opening any URL
#      under the site shows the app instead of GitHub Pages' 404 page.
#
# Usage:
#   BASE_PATH=/killteam-tracker/ ./build.sh     # GitHub Pages (what the workflow runs)
#   ./build.sh                                  # served from "/", e.g. a local test server
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

# 3. GitHub Pages serves 404.html for unknown URLs: make that the app too
cp "$OUT/index.html" "$OUT/404.html"

echo "Built $OUT/ for $BASE_PATH (cache version ktst-$HASH):"
(cd "$OUT" && find . -type f | sort | sed 's|^\./|  |')
