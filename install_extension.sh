#!/usr/bin/env bash

EXTENSION_DIR="webpage-to-markdown-local"
NAME="Webpage to Markdown"

STARTING_DIR="$(pwd)"
cd "$EXTENSION_DIR"

if [[ ! -x node_modules/.bin/ray ]]; then
  echo >&2 "Installing dependencies for $NAME..."
  npm ci || exit 1
fi

if npm run lint && npm run build ; then
  echo >&2 "✅ Installed the $NAME Raycast extension!"
else
  echo >&2 "⛔ Failure encountered when trying to install the $NAME Raycast extension!"
fi

cd "$STARTING_DIR"
