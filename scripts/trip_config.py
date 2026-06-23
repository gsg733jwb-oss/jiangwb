#!/usr/bin/env python3
"""读取 / 更新多行程配置 trip.config.json。"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

from paths import GUIDE_HOME, REPO_TRIP_CONFIG, TRIP_CONFIG, migrate_legacy_files


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_trip_config() -> dict[str, Any]:
    migrate_legacy_files()
    cfg = _read_json(TRIP_CONFIG) or _read_json(REPO_TRIP_CONFIG)
    if not cfg.get("trips"):
        raise SystemExit(
            "未找到 trip.config.json。请在 马泰攻略/ 下创建，参考 data/trip.config.json"
        )
    return cfg


def save_trip_config(cfg: dict[str, Any]) -> None:
    GUIDE_HOME.mkdir(parents=True, exist_ok=True)
    TRIP_CONFIG.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    REPO_TRIP_CONFIG.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def resolve_active_trip(cfg: dict[str, Any], trip_id: str | None = None) -> tuple[str, dict[str, Any]]:
    trips = cfg.get("trips") or {}
    tid = trip_id or cfg.get("activeTripId") or cfg.get("defaultTripId")
    if not tid or tid not in trips:
        tid = next(iter(trips.keys()), "")
    if not tid:
        raise SystemExit("trip.config.json 中没有任何行程")
    return tid, trips[tid]


def excel_for_trip(meta: dict[str, Any]) -> Path:
    name = meta.get("excel") or ""
    path = GUIDE_HOME / name
    if not path.is_file():
        raise SystemExit(f"找不到行程 Excel：{path}")
    return path


def manifest_entry(trip_id: str, meta: dict[str, Any], updated_at: str) -> dict[str, Any]:
    return {
        "id": trip_id,
        "title": meta.get("title") or trip_id,
        "subtitle": meta.get("subtitle") or "",
        "dateStart": meta.get("dateStart"),
        "dateEnd": meta.get("dateEnd"),
        "timezone": meta.get("timezone") or "Asia/Shanghai",
        "excel": meta.get("excel"),
        "updatedAt": updated_at,
    }


def sync_manifest(cfg: dict[str, Any], trip_id: str, meta: dict[str, Any], updated_at: str) -> dict[str, Any]:
    manifest = _read_json(Path(__file__).resolve().parent.parent / "miniprogram" / "data" / "manifest.json")
    if not manifest:
        manifest = {"version": 1, "defaultTripId": cfg.get("defaultTripId"), "trips": []}
    trips = {t["id"]: t for t in manifest.get("trips", []) if t.get("id")}
    trips[trip_id] = manifest_entry(trip_id, meta, updated_at)
    ordered = []
    for tid in cfg.get("trips", {}):
        if tid in trips:
            ordered.append(trips[tid])
    for tid, entry in trips.items():
        if tid not in cfg.get("trips", {}):
            ordered.append(entry)
    manifest["trips"] = ordered
    manifest["defaultTripId"] = cfg.get("defaultTripId") or trip_id
    manifest["activeTripId"] = cfg.get("activeTripId") or trip_id
    return manifest
