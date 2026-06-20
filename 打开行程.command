#!/bin/bash
# 吉隆坡行程网页 · 本地启动
# 错误 -102 = 服务器没跑起来，请勿直接双击 index.html
cd "$(dirname "$0")" || exit 1

PORT=8080
HOST=127.0.0.1

# 释放端口（仅结束本机 http.server）
for pid in $(lsof -ti tcp:$PORT 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null
done
sleep 0.3

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display alert "未安装 Python 3" message "请先安装 Python 3，或在终端运行：brew install python3"'
  exit 1
fi

# 若 8080 仍被占用，换端口
while lsof -ti tcp:$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8090 ]; then
    osascript -e 'display alert "无法启动" message "8080-8090 端口均被占用，请关闭其他程序后重试。"'
    exit 1
  fi
done

URL="http://${HOST}:${PORT}/"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  吉隆坡行程 · 本地预览"
echo "  地址：$URL"
echo "  ⚠️  请保持此窗口打开，关闭即停止服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 延迟打开浏览器，等服务就绪
(sleep 1.2 && open "$URL") &

# 前台运行服务器（窗口不会闪退）
exec python3 -m http.server "$PORT" --bind "$HOST"
