#!/usr/bin/env bash
# Sobe o noticias.json gerado pela tarefa diária do Cowork. Roda sozinho via launchd às 05h40 (ver ../launchd).
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
git pull --rebase -q origin main || true
git add noticias.json 2>/dev/null || exit 0
git diff --cached --quiet && exit 0
git commit -qm "notícias $(date +%d/%m/%Y)"
git push -q origin main
