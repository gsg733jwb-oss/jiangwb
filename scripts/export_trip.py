#!/usr/bin/env python3
"""Export KL travel Excel to data/trip.json for the web app."""
import json
import re
import openpyxl
from pathlib import Path

EXCEL = Path.home() / 'Desktop' / 'KL_Travel_Guide_2026-07-12_to_15.xlsx'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'trip.json'


def sheet_to_dict(ws, header_row=1):
    headers = [ws.cell(header_row, c).value for c in range(1, ws.max_column + 1)]
    rows = []
    for r in range(header_row + 1, ws.max_row + 1):
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


def export_full_budget(ws):
    title = str(ws.cell(1, 1).value or '').strip()
    subtitle = str(ws.cell(2, 1).value or '').strip()
    rows = sheet_to_dict(ws, header_row=4)
    cleaned = []
    for row in rows:
        cat = row.get('分类')
        item = row.get('项目')
        if not cat and not item:
            continue
        cleaned.append(row)
    return {'title': title, 'subtitle': subtitle, 'rows': cleaned}


def export_packing(ws):
    title = str(ws.cell(1, 1).value or '').strip()
    subtitle = str(ws.cell(2, 1).value or '').strip()
    rows = sheet_to_dict(ws, header_row=4)
    return {'title': title, 'subtitle': subtitle, 'rows': rows}


def export_food_rankings(ws):
    sections = []
    current = None
    headers = None

    for r in range(1, ws.max_row + 1):
        a = ws.cell(r, 1).value
        if a is None:
            continue
        text = str(a).strip()
        if text.startswith('【'):
            current = {'title': text, 'items': []}
            sections.append(current)
            headers = None
            continue
        if current is None:
            continue
        if text == '排名':
            headers = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
            continue
        if headers and isinstance(a, (int, float)):
            item = {}
            for i, h in enumerate(headers):
                if not h:
                    continue
                item[str(h)] = ws.cell(r, i + 1).value
            current['items'].append(item)

    return sections


def main():
    wb = openpyxl.load_workbook(EXCEL, data_only=True)
    out = {
        'title': '吉隆坡之旅 2026.7.12-15',
        'subtitle': '7天6晚 · 普吉 + 吉隆坡 · 2大1小',
        'overview': sheet_to_dict(wb['行程总览']),
        'days': {},
        'foodDist': sheet_to_dict(wb['美食分布']),
        'restaurants': sheet_to_dict(wb['美食餐厅']),
        'foodRankings': export_food_rankings(wb['吉隆坡美食推荐']),
        'mapList': sheet_to_dict(wb['地图清单对照']),
        'budget': sheet_to_dict(wb['预算明细']),
        'fullBudget': export_full_budget(wb['7天全预算']),
        'prep': sheet_to_dict(wb['行前准备']),
        'packing': export_packing(wb['出行全清单']),
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
    print(f'  days={len(out["days"])} foodRankings={len(out["foodRankings"])} fullBudget={len(out["fullBudget"]["rows"])} packing={len(out["packing"]["rows"])}')


if __name__ == '__main__':
    main()
