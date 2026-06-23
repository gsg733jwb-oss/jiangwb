#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MONITOR_DIR="$ROOT/flight_monitor"
PLIST_NAME="com.kltravel.flight-monitor.plist"
PLIST_SRC="$MONITOR_DIR/$PLIST_NAME"
PLIST_DST="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_DIR="$HOME/Library/Logs/kl-travel-guide"

mkdir -p "$LOG_DIR"

echo "安装 Python 依赖..."
python3 -m pip install --user -r "$MONITOR_DIR/requirements.txt"

chmod +x "$MONITOR_DIR/monitor.py" "$MONITOR_DIR/run.sh"

echo "安装 launchd 定时任务..."
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DST"

    launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"
    launchctl enable "gui/$(id -u)/$PLIST_NAME"

cat <<EOF

安装完成。

- 每日定时：9:00–23:00，每 2 小时一次（共 8 次）
- 日志：$LOG_DIR/flight-monitor.log
- 桌面记录：~/Desktop/马泰攻略/机票监控/（含 机票监控记录.md、机票监控.xlsx、日志/）

首次使用前请确认：
1. Safari → 设置 → 高级 → 勾选「在菜单栏中显示开发菜单」
2. Safari → 开发 → 允许 JavaScript 来自 Apple Events
3. 系统设置 → 隐私与安全性 → 自动化：允许 Terminal / Cursor / bash 控制 Safari 与信息
4. 定时查票时 Mac 需已登录且未锁屏（合盖休眠会抓不到携程页面）；脚本会在查票期间临时防休眠

说明：查票前自动自检；三程均无数据时会重置 Safari 并重试；全失败不发 iMessage。

立即试跑（不发 iMessage）：
  "$MONITOR_DIR/run.sh" --dry-run

立即试跑（含 iMessage）：
  "$MONITOR_DIR/run.sh"

或双击「马泰攻略/运行/查机票.command」
EOF
