"""通过 macOS Safari 静默抓取携程直飞航班。"""

from __future__ import annotations

import json
import subprocess
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass
class FlightOffer:
    airline: str
    flight_no: str
    dep_time: str
    arr_time: str
    price: int
    duration: str = ""
    source: str = "ctrip"

    def format_line(self) -> str:
        parts = [self.airline, self.flight_no, f"{self.dep_time}-{self.arr_time}", f"¥{self.price}"]
        if self.duration:
            parts.append(self.duration)
        return " ".join(p for p in parts if p)


def _escape_applescript_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def run_osascript(script: str, *, timeout: int = 90) -> str:
    try:
        proc = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Safari 操作超时（>{timeout}s）") from exc
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip() or "osascript failed")
    return proc.stdout.strip()


def reset_ctrip_session(*, activate: bool = False) -> None:
    """关闭携程标签并开新标签，避免复用脏页面。"""
    activate_block = "activate\ndelay 1\n" if activate else ""
    script = textwrap.dedent(
        f"""
        tell application "Safari"
            {activate_block}
            repeat with w in windows
                try
                    repeat with t in tabs of w
                        try
                            if URL of t contains "flights.ctrip.com" then
                                close t
                            end if
                        end try
                    end repeat
                end try
            end repeat
            if (count of windows) is 0 then
                make new document
            else
                tell window 1
                    make new tab
                    set current tab to tab 1
                end tell
            end if
        end tell
        """
    ).strip()
    run_osascript(script, timeout=30)


def _build_scrape_hint(payload: dict[str, Any], *, flights_found: int) -> str:
    if flights_found:
        return ""
    page_len = int(payload.get("page_len") or 0)
    has_direct = bool(payload.get("has_direct_label"))
    has_price = bool(payload.get("has_price"))
    direct_count = payload.get("direct_count")

    if page_len < 500:
        return "携程页面几乎为空（Mac 可能休眠/锁屏，或 Safari 自动化未生效）"
    if not has_direct and not has_price:
        return "携程页面未加载完成，或需要登录/验证"
    if direct_count and direct_count > 0:
        return f"页面显示 {direct_count} 个直飞但解析失败，请更新抓取脚本"
    if has_direct and not flights_found:
        return "检测到直飞列表但未能解析航班，可能页面结构已变化"
    return "未获取到直飞航班数据"


def _is_fatal_empty(hint: str) -> bool:
    return any(key in hint for key in ("几乎为空", "未加载", "自动化未生效", "超时"))


def search_ctrip_safari(
    url: str,
    *,
    wait_seconds: int = 18,
    top_n: int = 5,
    retries: int = 1,
    fresh_session: bool = False,
    activate: bool = False,
    osascript_timeout: int | None = None,
) -> dict[str, Any]:
    last_error: Exception | None = None
    last_payload: dict[str, Any] | None = None
    attempts = max(1, retries + 1)

    for attempt in range(attempts):
        try:
            attempt_wait = wait_seconds + attempt * 8
            timeout = osascript_timeout or min(attempt_wait + 45, 120)
            payload = _search_ctrip_once(
                url,
                wait_seconds=attempt_wait,
                top_n=top_n,
                fresh_session=fresh_session and attempt == 0,
                activate=activate,
                osascript_timeout=timeout,
            )
            last_payload = payload
            if payload["flights"]:
                return payload
            hint = str(payload.get("scrape_hint") or "")
            if _is_fatal_empty(hint) and attempt >= 1:
                return payload
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt >= attempts - 1:
                raise
        time.sleep(2)

    if last_error:
        raise last_error
    if last_payload is not None:
        return last_payload
    return {
        "flights": [],
        "direct_count": None,
        "scrape_hint": "携程查询失败",
        "source": "ctrip_safari",
    }


def _search_ctrip_once(
    url: str,
    *,
    wait_seconds: int,
    top_n: int,
    fresh_session: bool = False,
    activate: bool = False,
    osascript_timeout: int = 90,
) -> dict[str, Any]:
    if fresh_session:
        reset_ctrip_session(activate=activate)

    js_path = str((SCRIPT_DIR / "ctrip_extract.js").resolve())
    url_literal = _escape_applescript_string(url)
    max_polls = min(max(wait_seconds, 24), 40)
    activate_block = "activate\ndelay 1\n" if activate else ""

    script = textwrap.dedent(
        f"""
        set jsFile to POSIX file "{js_path}"
        set jsCode to read jsFile as «class utf8»
        set searchUrl to "{url_literal}"

        tell application "Safari"
            if not running then
                make new document
            end if
            {activate_block}

            set targetWindow to missing value
            repeat with w in windows
                try
                    set tabUrl to URL of current tab of w
                    if tabUrl contains "flights.ctrip.com/international/search" then
                        set targetWindow to w
                        exit repeat
                    end if
                end try
            end repeat

            if targetWindow is missing value then
                make new document
                set targetWindow to window 1
            end if

            tell targetWindow
                set URL of current tab to searchUrl
            end tell
            delay 2

            set ready to false
            repeat with i from 1 to {max_polls}
                delay 1
                tell targetWindow
                    tell current tab
                        set jsReady to do JavaScript "Boolean(document.body && document.body.innerText && document.body.innerText.indexOf('个直飞') > -1 && document.body.innerText.indexOf('¥') > -1)"
                    end tell
                end tell
                if jsReady is true then
                    set ready to true
                    exit repeat
                end if
            end repeat

            if ready then delay 2

            tell targetWindow
                tell current tab
                    set resultJson to do JavaScript jsCode
                end tell
            end tell
        end tell

        return resultJson
        """
    ).strip()

    raw = run_osascript(script, timeout=osascript_timeout)
    payload = json.loads(raw)
    flights = [
        FlightOffer(
            airline=item.get("airline", ""),
            flight_no=item.get("flight_no", ""),
            dep_time=item.get("dep_time", ""),
            arr_time=item.get("arr_time", ""),
            price=int(item.get("price", 0)),
            duration=item.get("duration", ""),
        )
        for item in payload.get("flights", [])[:top_n]
    ]
    scrape_hint = _build_scrape_hint(payload, flights_found=len(flights))
    return {
        "flights": flights,
        "direct_count": payload.get("direct_count"),
        "lowest_hint": payload.get("lowest_hint"),
        "updated_at": payload.get("updated_at", ""),
        "page_len": payload.get("page_len"),
        "has_direct_label": payload.get("has_direct_label"),
        "has_price": payload.get("has_price"),
        "scrape_hint": scrape_hint,
        "source": "ctrip_safari",
    }


def close_ctrip_safari() -> bool:
    """关闭监控打开的携程查询页；若窗口仅剩该页则关闭整个窗口。"""
    script = textwrap.dedent(
        """
        set closedSomething to false
        tell application "Safari"
            repeat with w in windows
                try
                    set ctripTabCount to 0
                    set totalTabCount to count of tabs of w
                    repeat with t in tabs of w
                        try
                            if URL of t contains "flights.ctrip.com/international/search" then
                                set ctripTabCount to ctripTabCount + 1
                            end if
                        end try
                    end repeat
                    if ctripTabCount > 0 and ctripTabCount is totalTabCount then
                        close w
                        set closedSomething to true
                    else if ctripTabCount > 0 then
                        repeat with t in tabs of w
                            try
                                if URL of t contains "flights.ctrip.com/international/search" then
                                    close t
                                    set closedSomething to true
                                end if
                            end try
                        end repeat
                    end if
                end try
            end repeat
        end tell
        return closedSomething
        """
    ).strip()
    try:
        raw = run_osascript(script, timeout=25).strip().lower()
        return raw in {"true", "1", "yes"}
    except Exception:  # noqa: BLE001
        return False
