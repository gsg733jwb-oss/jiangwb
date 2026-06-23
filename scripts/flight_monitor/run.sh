#!/bin/bash
# 机票监控入口（launchd / 双击均可）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

LOG_DIR="${HOME}/Library/Logs/kl-travel-guide"
mkdir -p "$LOG_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-$(eval echo ~$(id -un))}"

if command -v caffeinate >/dev/null 2>&1; then
  caffeinate -dimsu -w $$ &
fi

exec python3 "$DIR/monitor.py" "$@"
