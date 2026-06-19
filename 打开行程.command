#!/bin/bash
cd "$(dirname "$0")"
PORT=8080
URL="http://127.0.0.1:$PORT"

if lsof -i :$PORT >/dev/null 2>&1; then
  echo "服务器已在运行，正在打开浏览器…"
  open "$URL"
  exit 0
fi

echo "正在启动本地服务器（端口 $PORT）…"
python3 -m http.server "$PORT" &
PID=$!
sleep 1

if ! kill -0 "$PID" 2>/dev/null; then
  echo "启动失败。请确认已安装 Python 3。"
  read -r -p "按回车键关闭…"
  exit 1
fi

open "$URL"
echo ""
echo "✓ 已在浏览器打开：$URL"
echo "✓ 关闭此终端窗口即可停止服务器"
wait "$PID"
