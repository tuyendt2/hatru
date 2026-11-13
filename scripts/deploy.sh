#!/bin/sh
# GitHub Pages serves the gh-pages branch: copy the app files there.
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r index.html app.js style.css sw.js manifest.webmanifest icons .nojekyll "$TMP"
(cd "$TMP" && git init -q -b gh-pages && git add -A && git commit -q -m "Deploy $(date +%F)" && git push -f "$REMOTE" gh-pages)
rm -rf "$TMP"
echo "Deployed to gh-pages"
