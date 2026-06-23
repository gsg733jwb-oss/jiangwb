#!/usr/bin/env python3
"""每日机票监控：三程直飞 + 自检修复。"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from ctrip_safari import FlightOffer, close_ctrip_safari, search_ctrip_safari
from google_flights import search_google_flights
from notify import send_imessage
from record import save_records
from self_heal import (
    count_ok_results,
    full_repair,
    pre_run_checks,
    should_skip_imessage,
)

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"


def load_config(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_flight_no(value: str) -> str:
    compact = re.sub(r"\s+", "", value.upper())
    match = re.search(r"([A-Z0-9]{2}\d{3,4})", compact)
    return match.group(1) if match else compact


def _parse_hhmm(value: str) -> int:
    hour, minute = value.strip().split(":")
    return int(hour) * 60 + int(minute)


def _flight_track_key(flight_no: str) -> str:
    normalized = _normalize_flight_no(flight_no)
    if normalized in {"D7330", "AK7330"}:
        return "D7330"
    return normalized


def _matches_booked_target(flight_no: str, targets: set[str]) -> bool:
    normalized = _normalize_flight_no(flight_no)
    if normalized in targets:
        return True
    if normalized in {"D7330", "AK7330"} and ({"D7330", "AK7330"} & targets):
        return True
    return False


def filter_route_flights(
    flights: list[FlightOffer],
    route: dict[str, Any],
    *,
    top_n: int,
) -> tuple[list[FlightOffer], str | None]:
    booked_raw = [str(item) for item in route.get("booked_flights", [])]
    booked = {_normalize_flight_no(x) for x in booked_raw}
    window = route.get("departure_window")

    def in_window(dep_time: str) -> bool:
        if not window or len(window) != 2:
            return True
        start, end = _parse_hhmm(window[0]), _parse_hhmm(window[1])
        return start <= _parse_hhmm(dep_time) <= end

    if booked:
        matched = [f for f in flights if _matches_booked_target(f.flight_no, booked)]
        if matched:
            ordered: list[FlightOffer] = []
            seen_keys: set[str] = set()
            for booked_no in booked_raw:
                track_key = _flight_track_key(booked_no)
                if track_key in seen_keys:
                    continue
                for flight in matched:
                    if _flight_track_key(flight.flight_no) == track_key:
                        ordered.append(flight)
                        seen_keys.add(track_key)
                        break
            return ordered, None
        return [], f"未找到已订航班 {', '.join(booked_raw)}"

    pool = flights
    if window:
        matched = [f for f in flights if in_window(f.dep_time)]
        if not matched:
            return [], f"未找到 {window[0]}–{window[1]} 时段直飞"
        pool = matched

    pool = sorted(pool, key=lambda f: (f.price, f.dep_time))
    seen: set[str] = set()
    uniq: list[FlightOffer] = []
    for flight in pool:
        key = f"{_normalize_flight_no(flight.flight_no)}|{flight.dep_time}|{flight.price}"
        if key in seen:
            continue
        seen.add(key)
        uniq.append(flight)
        if len(uniq) >= top_n:
            break
    return uniq, None


def build_ctrip_url(template: str, route: dict[str, Any], year: int, adults: int) -> str:
    month, day = route["date"].split("-")
    date = f"{year}-{month}-{day}"
    return template.format(
        **{
            "from": route["from_airport"],
            "to": route["to_airport"],
            "date": date,
            "adults": adults,
        }
    )


def search_route(
    route: dict[str, Any],
    config: dict[str, Any],
    *,
    recovery: bool = False,
) -> dict[str, Any]:
    year = int(config["year"])
    top_n = int(config.get("top_n", 5))
    adults = int(config.get("passengers", 1))
    month, day = route["date"].split("-")
    iso_date = f"{year}-{month}-{day}"
    ctrip_cfg = config.get("ctrip", {})

    result: dict[str, Any] = {
        "id": route["id"],
        "label": route["label"],
        "date": f"{year}-{route['date']}",
        "flights": [],
        "source": "",
        "error": None,
    }

    primary = config.get("sources", {}).get("primary", "ctrip_safari")
    fallback = config.get("sources", {}).get("fallback", "")
    sources = [primary] + ([fallback] if fallback else [])
    errors: list[str] = []

    for source in sources:
        try:
            fetch_n = max(top_n, 30) if route.get("booked_flights") or route.get("departure_window") else top_n
            if source == "ctrip_safari":
                url = build_ctrip_url(ctrip_cfg["search_url"], route, year, adults)
                print(f"  → 查询 {route['label']}…", flush=True)
                payload = search_ctrip_safari(
                    url,
                    wait_seconds=int(ctrip_cfg.get("wait_seconds", 28)),
                    top_n=fetch_n,
                    retries=int(ctrip_cfg.get("retries", 1)),
                    fresh_session=recovery,
                    activate=recovery,
                    osascript_timeout=int(ctrip_cfg.get("osascript_timeout", 100)),
                )
                result["flights"] = payload["flights"]
                result["source"] = payload["source"]
                result["direct_count"] = payload.get("direct_count")
                result["updated_at"] = payload.get("updated_at")
                result["scrape_hint"] = payload.get("scrape_hint")
                result["url"] = url
            elif source == "google_flights":
                payload = search_google_flights(
                    route["from_airport"],
                    route["to_airport"],
                    iso_date,
                    top_n=fetch_n,
                    adults=adults,
                )
                result["flights"] = payload["flights"]
                result["source"] = payload["source"]
            else:
                continue

            if result["flights"]:
                filtered, filter_error = filter_route_flights(result["flights"], route, top_n=top_n)
                result["flights"] = filtered
                if filter_error and not filtered:
                    errors.append(filter_error)
                    result["flights"] = []
                else:
                    result["error"] = None
                    return result
            elif source == "ctrip_safari":
                hint = str(result.get("scrape_hint") or "").strip()
                errors.append(hint or "携程未返回航班数据")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{source}: {exc}")

    if errors:
        result["error"] = "；".join(dict.fromkeys(errors))
    return result


def fetch_all_routes(config: dict[str, Any], *, recovery: bool = False) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for idx, route in enumerate(config["routes"]):
        if idx > 0:
            time.sleep(3)
        results.append(search_route(route, config, recovery=recovery))
    return results


def build_message(run_at: datetime, route_results: list[dict[str, Any]], saved_paths: dict[str, str]) -> str:
    lines = [
        f"✈️ 机票监控 {run_at.strftime('%m/%d %H:%M')}",
        "7/9 上海→普吉 | 7/12 普吉→吉隆坡 | 7/15 9C6524+D7330",
        "已订/目标航班价格",
        "",
    ]
    for item in route_results:
        lines.append(f"【{item['label']}】{item['date']}")
        flights: list[FlightOffer] = item.get("flights", [])
        if flights:
            for idx, flight in enumerate(flights, start=1):
                lines.append(f"{idx}. {flight.format_line()}")
        else:
            lines.append(f"查询失败：{item.get('error') or '未找到直飞航班'}")
        lines.append("")
    lines.append(f"记录：{saved_paths.get('markdown', '')}")
    return "\n".join(lines).strip()


def run(config_path: Path, *, dry_run: bool = False, skip_imessage: bool = False) -> int:
    if not pre_run_checks():
        return 0

    config = load_config(config_path)
    run_at = datetime.now()
    print("开始查票…", flush=True)

    try:
        route_results = fetch_all_routes(config, recovery=False)
        ok = count_ok_results(route_results)
        total = len(config["routes"])

        if ok < total:
            print(f"首轮 {ok}/{total} 程有数据，触发自检修复并重试…", flush=True)
            full_repair()
            route_results = fetch_all_routes(config, recovery=True)
            ok = count_ok_results(route_results)
            print(f"修复后 {ok}/{total} 程有数据", flush=True)

        notes_parts = [f"数据源: ctrip_safari", f"成功 {ok}/{total} 程"]
        if ok < total:
            notes_parts.append("部分查询失败")
        notes = "；".join(notes_parts)

        saved_paths = save_records(
            desktop_dir=config["record"]["desktop_dir"],
            markdown_file=config["record"]["markdown_file"],
            excel_file=config["record"]["excel_file"],
            json_log_dir=config["record"]["json_log_dir"],
            run_at=run_at,
            route_results=route_results,
            notes=notes,
            price_change_threshold=int(config["record"].get("price_change_threshold", 50)),
        )

        message = build_message(run_at, route_results, saved_paths)
        print(message)
        print("\n已保存：")
        for key, value in saved_paths.items():
            print(f"- {key}: {value}")

        if should_skip_imessage(route_results):
            print("\n三程均无有效数据，跳过 iMessage（避免误报）", file=sys.stderr)
            return 1

        notify_cfg = config.get("notify", {})
        if dry_run or skip_imessage or not notify_cfg.get("enabled", True):
            return 0

        recipient = notify_cfg.get("imessage_recipient", "").strip()
        if not recipient:
            print("未配置 iMessage 收件人，跳过发送。", file=sys.stderr)
            return 0

        send_imessage(recipient, message)
        print(f"\niMessage 已发送至 {recipient}")
        return 0
    finally:
        uses_ctrip = config.get("sources", {}).get("primary") == "ctrip_safari"
        if uses_ctrip:
            try:
                if close_ctrip_safari():
                    print("\n已关闭 Safari 携程查询页")
            except Exception as exc:  # noqa: BLE001
                print(f"\n关闭 Safari 携程查询页失败：{exc}", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description="每日三程直飞机票监控")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-imessage", action="store_true")
    parser.add_argument("--self-check", action="store_true", help="仅运行自检")
    args = parser.parse_args()

    if args.self_check:
        return 0 if pre_run_checks() else 1
    return run(args.config, dry_run=args.dry_run, skip_imessage=args.skip_imessage)


if __name__ == "__main__":
    raise SystemExit(main())
