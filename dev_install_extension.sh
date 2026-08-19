#!/usr/bin/env bash

EXTENSION_DIR="webpage-to-markdown-local"

STARTING_DIR="$(pwd)"

exit_cleanly() {
  echo >&2 "🛑 Stopped developing the $NAME Raycast extension."
  cd "$STARTING_DIR"
  exit 0
}

trap exit_cleanly INT

cd "$EXTENSION_DIR"
NAME="Webpage to Markdown"

echo >&2 "💻 Initializing dev environment with live updates auto-reloading for the $NAME Raycast extension!"

if npm install && npm run dev ; then
  echo >&2 "✅ Done developing the $NAME Raycast extension!"
else
  status=$?
  if [ "$status" -eq 130 ]; then
    exit_cleanly
  fi

  echo >&2 "⛔ Failure encountered when trying to initialize dev environment with live reloading for the $NAME Raycast extension!"
fi

cd "$STARTING_DIR"
