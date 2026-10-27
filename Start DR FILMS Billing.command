#!/bin/bash
# -------------------------------------------------------------
# DR FILMS BILLING SOFTWARE — Direct Launcher (macOS)
# Double-click this file in Finder to launch the app directly!
# -------------------------------------------------------------

# Navigate to the software folder
cd "$(dirname "$0")" || exit 1

# Ensure PATH includes standard Node and npm installations (Homebrew, nvm, /usr/local/bin)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

echo ""
echo "=========================================================="
echo "           🎬 DR FILMS BILLING SOFTWARE                   "
echo "=========================================================="
echo "  Starting local billing server & opening browser...      "
echo "  Direct Link: http://127.0.0.1:5173/                     "
echo "  Press Ctrl+C in this Terminal window anytime to stop.   "
echo "=========================================================="
echo ""

# Verify Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js is not found on your system."
  echo "Please install Node.js from https://nodejs.org or run 'brew install node'."
  echo "Press Enter to exit."
  read -r
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "📦 First-time setup: installing dependencies..."
  npm install
  echo ""
fi

# Clean up any orphan process lingering on port 5173 so port 5173 is always ready
EXISTING_PID=$(lsof -ti :5173 2>/dev/null)
if [ -n "$EXISTING_PID" ]; then
  echo "🔄 Freeing port 5173 (closing previous background session)..."
  kill -9 $EXISTING_PID 2>/dev/null || true
  sleep 1
fi

# Start dev server and open browser directly to http://127.0.0.1:5173/
npm start
