"""查票前自检与无数据时自动修复。"""

from __future__ import annotations

import subprocess
import textwrap
from datetime import datetime
from pathlib import Path
from typing import Any

from ctrip_safari import reset_ctrip_session, run_osascript

LOG_DIR = Path.home() / "Library/Logs/kl-travel-guide"


def _log(msg: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    with (LOG_DIR / "flight-monitor.error.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def is_screen_locked() -> bool:
    try:
        proc = subprocess.run(
            ["ioreg", "-n", "Root", "-d1", "-w0"],
            capture_output=True,
            text=True,
            check=False,
        )
        return '"CGSSessionScreenIsLocked"=Yes' in proc.stdout
    except OSError:
        return False


def ensure_safari_running() -> None:
    if subprocess.run(["pgrep", "-xq", "Safari"], check=False).returncode != 0:
        _log("自检：Safari 未运行，正在启动…")
        subprocess.run(["open", "-g", "-a", "Safari"], check=False)
        subprocess.run(["sleep", "2"], check=False)


def safari_js_probe() -> tuple[bool, str]:
    script = textwrap.dedent(
        """
        tell application "Safari"
            if not running then
                make new document
            end if
            if (count of windows) is 0 then
                make new document
            end if
            tell window 1
                tell current tab
                    if URL is missing value then
                        set URL to "about:blank"
                        delay 1
                    else if URL is "" then
                        set URL to "about:blank"
                        delay 1
                    end if
                    set probe to do JavaScript "'ok'"
                end tell
            end tell
        end tell
        return probe
        """
    ).strip()
    try:
        raw = run_osascript(script, timeout=25).strip().strip('"')
        return raw == "ok", raw or "empty"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def pre_run_checks() -> bool:
    if is_screen_locked():
        _log("自检：屏幕已锁定，跳过查票")
        return False

    ensure_safari_running()
    ok, detail = safari_js_probe()
    if not ok:
        _log(f"自检：Safari JavaScript 不可用（{detail}）")
        _log("请检查：Safari → 开发 → 允许 JavaScript 来自 Apple Events")
        _log("以及 系统设置 → 隐私 → 自动化：允许 bash/python 控制 Safari")
        reset_ctrip_session(activate=True)
        ok, detail = safari_js_probe()
        if not ok:
            _log(f"自检修复失败：{detail}")
            return False
    _log("自检：通过")
    return True


def count_ok_results(route_results: list[dict[str, Any]]) -> int:
    return sum(1 for item in route_results if item.get("flights"))


def full_repair() -> None:
    _log("自检：三程均无数据，开始自动修复（重置 Safari 携程会话）…")
    ensure_safari_running()
    reset_ctrip_session(activate=True)
    subprocess.run(["sleep", "2"], check=False)


def should_skip_imessage(route_results: list[dict[str, Any]]) -> bool:
    return count_ok_results(route_results) == 0
