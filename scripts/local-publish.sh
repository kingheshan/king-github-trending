#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npm run build

git add public/data/trending.json data/deepseek-cache.json
if git diff --cached --quiet; then
  echo "No data changes to publish."
  exit 0
fi

git commit -m "chore: daily data refresh"
git push
