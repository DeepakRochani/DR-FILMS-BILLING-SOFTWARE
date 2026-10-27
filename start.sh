#!/bin/bash
# -------------------------------------------------------------
# DR FILMS BILLING SOFTWARE — Terminal Shell Launcher
# Run './start.sh' in terminal to launch the app!
# -------------------------------------------------------------

cd "$(dirname "$0")" || exit 1

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Clean up any orphan process lingering on port 5173
EXISTING_PID=$(lsof -ti :5173 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

# Start dev server and open browser directly to http://127.0.0.1:5173/
npm start
