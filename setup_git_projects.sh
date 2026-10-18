#!/bin/bash

# Первый параметр — ссылка на GitHub-репозиторий.
# Второй параметр — сообщение коммита (необязательно).
REPO_URL="$1"
COMMIT_MESSAGE="${2:-Первый коммит}"

if [ -z "$REPO_URL" ]; then
  echo "Использование: $0 <ссылка-на-репозиторий> [сообщение-коммита]"
  exit 1
fi

git init
git add .
git commit -m "$COMMIT_MESSAGE"
git branch -M main
git remote add origin "$REPO_URL"
git push -u origin main
