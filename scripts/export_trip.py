#!/usr/bin/env python3
"""Export KL travel Excel to data/trip.json for the web app."""
import json
import openpyxl
from pathlib import Path

EXCEL = Path.home() / 'Desktop' / 'KL_Travel_Guide_2026-07-12_to_15.xlsx'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'trip.json'


def sheet_to_dict(ws):
    headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]
    rows = []
    for r in range(2, ws.max_row + 1):
        row = {}
        empty = True
        for i, h in enumerate(headers):
            if not h:
                continue
            v = ws.cell(r, i + 1).value
            if v is not None and str(v).strip():
                empty = False
            row[str(h)] = v
        if not empty:
            rows.append(row)
    return rows


def main():
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    out = {
        'title': '吉隆坡之旅 2026.7.12-15',
        'overview': sheet_to_dict(wb['行程总览']),
        'days': {},
        'foodDist': sheet_to_dict(wb['美食分布']),
        'restaurants': sheet_to_dict(wb['美食餐厅']),
        'mapList': sheet_to_dict(wb['地图清单对照']),
        'budget': sheet_to_dict(wb['预算明细']),
        'prep': sheet_to_dict(wb['行前准备']),
    }
    for name in wb.sheetnames:
        if name.startswith('Day'):
            out['days'][name.replace('Day', '').strip()] = sheet_to_dict(wb[name])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(out, ensure_ascii=False, indent=2, default=str)
    OUT.write_text(text, encoding='utf-8')
    inline = OUT.parent / 'trip.inline.js'
    inline.write_text(f'window.__TRIP_DATA__ = {text};\n', encoding='utf-8')
    print(f'Exported → {OUT}')
    print(f'Inline   → {inline}')


if __name__ == '__main__':
    main()
