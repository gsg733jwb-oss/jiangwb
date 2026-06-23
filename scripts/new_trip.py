#!/usr/bin/env python3
"""在 trip.config.json 中登记一趟新行程。"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import GUIDE_HOME, ensure_dirs  # noqa: E402
from trip_config import load_trip_config, save_trip_config  # noqa: E402


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r'[^a-z0-9\u4e00-\u9fff]+', '-', text)
    return text.strip('-')[:40] or 'trip'


def main():
    parser = argparse.ArgumentParser(description='登记新行程到 trip.config.json')
    parser.add_argument('--id', help='行程 id，如 jp-2027-04')
    parser.add_argument('--title', required=True, help='标题')
    parser.add_argument('--subtitle', default='', help='副标题')
    parser.add_argument('--excel', required=True, help='Excel 文件名（放在马泰攻略/ 下）')
    parser.add_argument('--date-start', required=True, help='YYYY-MM-DD')
    parser.add_argument('--date-end', required=True, help='YYYY-MM-DD')
    parser.add_argument('--timezone', default='Asia/Shanghai')
    parser.add_argument('--active', action='store_true', help='设为当前编辑行程')
    args = parser.parse_args()

    ensure_dirs()
    cfg = load_trip_config()
    trip_id = args.id or slugify(args.title)
    excel_path = GUIDE_HOME / args.excel
    if not excel_path.is_file():
        raise SystemExit(f'请先把 Excel 放到：{excel_path}')

    cfg.setdefault('trips', {})[trip_id] = {
        'excel': args.excel,
        'title': args.title,
        'subtitle': args.subtitle,
        'timezone': args.timezone,
        'dateStart': args.date_start,
        'dateEnd': args.date_end,
    }
    if args.active or not cfg.get('defaultTripId'):
        cfg['defaultTripId'] = trip_id
        cfg['activeTripId'] = trip_id

    save_trip_config(cfg)
    print(json.dumps(cfg['trips'][trip_id], ensure_ascii=False, indent=2))
    print(f'\n已登记 {trip_id}。下一步：')
    print(f'  python3 scripts/export_trip.py --trip-id {trip_id}')


if __name__ == '__main__':
    main()
