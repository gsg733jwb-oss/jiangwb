#!/usr/bin/env python3
"""马泰攻略统一路径：数据在桌面「马泰攻略」，代码在 kl-travel-guide。"""
from __future__ import annotations

import shutil
from pathlib import Path

GUIDE_HOME = Path.home() / "Desktop" / "马泰攻略"
TRIP_EXCEL = GUIDE_HOME / "KL_Travel_Guide_2026-07-12_to_15.xlsx"
FLIGHT_DIR = GUIDE_HOME / "机票监控"
FLIGHT_LOG_DIR = FLIGHT_DIR / "日志"
WEB_DATA_DIR = GUIDE_HOME / "网页数据"
ARCHIVE_DIR = GUIDE_HOME / "历史文案"
SCRIPTS_DIR = GUIDE_HOME / "脚本"
RUN_DIR = GUIDE_HOME / "运行"

WEB_PROJECT = Path.home() / "Projects" / "kl-travel-guide"
WEB_DATA_OUT = WEB_PROJECT / "data" / "trip.json"
WEB_DATA_INLINE = WEB_PROJECT / "data" / "trip.inline.js"
PLACES_JSON = WEB_PROJECT / "data" / "places.json"
TRIP_CONFIG = GUIDE_HOME / "trip.config.json"
REPO_TRIP_CONFIG = WEB_PROJECT / "data" / "trip.config.json"
MINIPROGRAM_DIR = WEB_PROJECT / "miniprogram"
MP_DATA_DIR = MINIPROGRAM_DIR / "data"
MP_MANIFEST = MP_DATA_DIR / "manifest.json"
MP_ALL_TRIPS = MP_DATA_DIR / "all-trips.json"
MP_ALL_PLACES = MP_DATA_DIR / "all-places.json"
REPO_SCRIPTS = WEB_PROJECT / "scripts"
FLIGHT_MONITOR = REPO_SCRIPTS / "flight_monitor"

OLD_TRIP_EXCEL = Path.home() / "Desktop" / "KL_Travel_Guide_2026-07-12_to_15.xlsx"
OLD_FLIGHT_DIR = Path.home() / "Desktop" / "机票监控"
OLD_FLIGHT_LOG = Path.home() / "Desktop" / "机票监控日志"


def ensure_dirs() -> None:
    for d in (GUIDE_HOME, FLIGHT_DIR, FLIGHT_LOG_DIR, WEB_DATA_DIR, ARCHIVE_DIR, RUN_DIR):
        d.mkdir(parents=True, exist_ok=True)


def migrate_legacy_files() -> None:
    """从桌面旧位置迁入马泰攻略（仅当目标不存在时复制）。"""
    ensure_dirs()
    if OLD_TRIP_EXCEL.exists() and not TRIP_EXCEL.exists():
        shutil.copy2(OLD_TRIP_EXCEL, TRIP_EXCEL)
    if not OLD_FLIGHT_DIR.is_dir():
        return
    for name in ("机票监控.xlsx", "机票监控记录.md"):
        src = OLD_FLIGHT_DIR / name
        dst = FLIGHT_DIR / name
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
    if OLD_FLIGHT_LOG.is_dir() and not any(FLIGHT_LOG_DIR.glob("*.json")):
        for path in OLD_FLIGHT_LOG.glob("*.json"):
            shutil.copy2(path, FLIGHT_LOG_DIR / path.name)
    elif not any(FLIGHT_LOG_DIR.glob("*.json")):
        old_logs = OLD_FLIGHT_DIR / "日志"
        if old_logs.is_dir():
            for path in old_logs.glob("*.json"):
                shutil.copy2(path, FLIGHT_LOG_DIR / path.name)
