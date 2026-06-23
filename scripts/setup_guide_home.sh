#!/bin/bash
# 初始化桌面「马泰攻略」目录：数据、脚本快捷方式、双击运行入口、历史归档
set -euo pipefail

GUIDE_HOME="$HOME/Desktop/马泰攻略"
REPO="$HOME/Projects/kl-travel-guide"
SCRIPTS="$REPO/scripts"

mkdir -p "$GUIDE_HOME"/{网页数据,历史文案,脚本,运行,机票监控/日志}

# 从旧桌面位置迁入（Python 侧也会做，这里先跑一遍）
python3 -c "import sys; sys.path.insert(0, '$SCRIPTS'); from paths import migrate_legacy_files, ensure_dirs; ensure_dirs(); migrate_legacy_files()"

# 脚本目录：指向仓库（单一源码，桌面可见）
link_script() {
  local name="$1"
  local target="$2"
  ln -sfn "$target" "$GUIDE_HOME/脚本/$name"
}
link_script "paths.py" "$SCRIPTS/paths.py"
link_script "export_trip.py" "$SCRIPTS/export_trip.py"
link_script "format_trip_day_sheets.py" "$SCRIPTS/format_trip_day_sheets.py"
link_script "format_full_trip_sheets.py" "$SCRIPTS/format_full_trip_sheets.py"
link_script "merge_prep_packing.py" "$SCRIPTS/merge_prep_packing.py"
link_script "push_guide.sh" "$SCRIPTS/push_guide.sh"
link_script "install_flight_monitor.sh" "$SCRIPTS/install_flight_monitor.sh"
link_script "flight_monitor" "$SCRIPTS/flight_monitor"

# 历史文案：归档机票记录与日志快照
ARCHIVE="$GUIDE_HOME/历史文案"
FLIGHT="$GUIDE_HOME/机票监控"
stamp="$(date '+%Y-%m-%d')"
if [[ -f "$FLIGHT/机票监控记录.md" ]]; then
  cp -n "$FLIGHT/机票监控记录.md" "$ARCHIVE/机票监控记录-${stamp}.md" 2>/dev/null || \
    cp "$FLIGHT/机票监控记录.md" "$ARCHIVE/机票监控记录-${stamp}.md"
fi
if [[ -d "$FLIGHT/日志" ]]; then
  mkdir -p "$ARCHIVE/机票日志"
  for f in "$FLIGHT/日志"/*.json; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    cp -n "$f" "$ARCHIVE/机票日志/$base" 2>/dev/null || cp "$f" "$ARCHIVE/机票日志/$base"
  done
fi
if [[ -f "$GUIDE_HOME/网页数据/trip.json" ]]; then
  cp -n "$GUIDE_HOME/网页数据/trip.json" "$ARCHIVE/trip-${stamp}.json" 2>/dev/null || true
fi

write_command() {
  local file="$1"
  local body="$2"
  printf '%s\n' "$body" > "$file"
  chmod +x "$file"
}

write_command "$GUIDE_HOME/运行/查机票.command" '#!/bin/bash
set -euo pipefail
exec "$HOME/Projects/kl-travel-guide/scripts/flight_monitor/run.sh" --dry-run
'

write_command "$GUIDE_HOME/运行/查机票并发通知.command" '#!/bin/bash
set -euo pipefail
exec "$HOME/Projects/kl-travel-guide/scripts/flight_monitor/run.sh"
'

write_command "$GUIDE_HOME/运行/打开行程网页.command" '#!/bin/bash
# 吉隆坡行程网页 · 本地启动
cd "$HOME/Projects/kl-travel-guide" || exit 1
PORT=8080
HOST=127.0.0.1
for pid in $(lsof -ti tcp:$PORT 2>/dev/null); do kill -9 "$pid" 2>/dev/null; done
sleep 0.3
if ! command -v python3 >/dev/null 2>&1; then
  osascript -e '"'"'display alert "未安装 Python 3" message "请先安装 Python 3"'"'"'
  exit 1
fi
while lsof -ti tcp:$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  [[ "$PORT" -le 8090 ]] || { osascript -e '"'"'display alert "无法启动" message "8080-8090 端口均被占用"'"'"'; exit 1; }
done
URL="http://${HOST}:${PORT}/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  吉隆坡行程 · 本地预览"
echo "  地址：$URL"
echo "  ⚠️  请保持此窗口打开，关闭即停止服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
(sleep 1.2 && open "$URL") &
exec python3 -m http.server "$PORT" --bind "$HOST"
'

write_command "$GUIDE_HOME/运行/同步行程到网页.command" '#!/bin/bash
set -euo pipefail
cd "$HOME/Projects/kl-travel-guide" || exit 1
python3 scripts/export_trip.py
echo ""
echo "已同步：网页 data/ + 小程序 miniprogram/data/"
echo "微信开发者工具打开目录：Projects/kl-travel-guide/miniprogram"
read -r -p "按回车关闭…" _
'

write_command "$GUIDE_HOME/运行/优化行程表.command" '#!/bin/bash
set -euo pipefail
cd "$HOME/Projects/kl-travel-guide" || exit 1
python3 scripts/format_trip_day_sheets.py
python3 scripts/format_full_trip_sheets.py
echo ""
echo "已优化 Excel 格式（马泰攻略/KL_Travel_Guide_*.xlsx）"
read -r -p "按回车关闭…" _
'

write_command "$GUIDE_HOME/运行/上传攻略.command" '#!/bin/bash
set -euo pipefail
REPO="$HOME/Projects/kl-travel-guide"
cd "$REPO" || exit 1
echo "推送到 Gitee（默认 origin）"
echo "如需附带提交，可在终端运行："
echo "  $REPO/scripts/push_guide.sh -m \"更新说明\""
echo ""
"$REPO/scripts/push_guide.sh" "$@"
echo ""
read -r -p "按回车关闭…" _
'

write_command "$GUIDE_HOME/运行/上传攻略到GitHub.command" '#!/bin/bash
set -euo pipefail
exec "$HOME/Projects/kl-travel-guide/scripts/push_guide.sh" --github "$@"
'

write_command "$GUIDE_HOME/运行/安装机票定时.command" '#!/bin/bash
set -euo pipefail
exec "$HOME/Projects/kl-travel-guide/scripts/install_flight_monitor.sh"
'

write_command "$GUIDE_HOME/运行/初始化马泰攻略.command" '#!/bin/bash
set -euo pipefail
exec "$HOME/Projects/kl-travel-guide/scripts/setup_guide_home.sh"
'

# 项目根目录快捷方式（可选，方便从仓库双击）
ln -sfn "$GUIDE_HOME/运行/查机票.command" "$REPO/查机票.command"
ln -sfn "$GUIDE_HOME/运行/打开行程网页.command" "$REPO/打开行程.command"

cat <<EOF

马泰攻略目录已就绪：$GUIDE_HOME

  KL_Travel_Guide_2026-07-12_to_15.xlsx  行程 Excel
  机票监控/          机票记录、日志
  网页数据/          trip.json 备份
  历史文案/          机票记录与日志归档
  脚本/              指向 kl-travel-guide/scripts
  运行/              双击运行（查机票、同步、打开网页、上传 Gitee 等）

EOF
