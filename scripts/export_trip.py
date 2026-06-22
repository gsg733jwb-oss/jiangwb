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


def export_checklist(ws):
    title = str(ws.cell(1, 1).value or '').strip()
    subtitle = str(ws.cell(2, 1).value or '').strip()
    rows = sheet_to_dict(ws, header_row=4)
    return {'title': title, 'subtitle': subtitle, 'rows': rows}


def split_type_cat(label):
    text = str(label or '').strip()
    if '·' in text:
        a, b = text.split('·', 1)
        return a.strip(), b.strip()
    return text, '其他'


def derive_food_dist(restaurants):
    rows = []
    for r in restaurants:
        day = str(r.get('安排日') or '').strip()
        if not day or '备选' in day:
            continue
        m = re.match(r'(\d+/\d+)\s*(.*)', day)
        if not m:
            continue
        meal = m.group(2).strip() or '—'
        rows.append({
            '日期': m.group(1),
            '餐次': meal,
            '餐厅': r.get('餐厅'),
            '必点': r.get('必点菜品'),
            '人均RM': r.get('人均(RM)'),
            '说明': r.get('地址'),
        })
    return rows


def export_merged_budget(ws):
    """Read combined 预算 sheet (7天全预算 + 预算明细 + 行前准备)."""
    title = str(ws.cell(1, 1).value or '7天全程预算').strip()
    subtitle = str(ws.cell(2, 1).value or '').strip()
    total_budget = ws.cell(5, 6).value
    total_paid = ws.cell(5, 7).value

    budget_rows = []
    full_rows = []
    checklist_rows = []

    for r in range(6, ws.max_row + 1):
        src = ws.cell(r, 1).value
        if not src:
            continue
        cat = ws.cell(r, 2).value
        date = ws.cell(r, 3).value
        item = ws.cell(r, 4).value
        note = ws.cell(r, 5).value
        est = ws.cell(r, 6).value
        paid = ws.cell(r, 7).value
        optional = ws.cell(r, 8).value
        status = ws.cell(r, 9).value

        if src == '预算明细':
            amount = est if est is not None else 0
            budget_rows.append({
                '日期': date,
                '类别': cat,
                '项目': item,
                '费用下限(RM)': amount,
                '费用上限(RM)': amount,
                '人均/合计': '人均' if cat == '餐饮' else '合计',
                '备注': note or '',
            })
        elif src == '7天全预算':
            full_rows.append({
                '分类': cat,
                '项目': item,
                '说明': note,
                '预估上限(¥)': est,
                '实际支付(¥)': paid,
                '可选': optional or None,
                '是否已订': status or '',
            })
        elif src == '行前准备':
            type_name, sub_cat = split_type_cat(cat)
            checklist_rows.append({
                '类型': type_name,
                '分类': sub_cat,
                '事项/物品': item,
                '何时/数量': date,
                '必备': '是',
                '预算(¥)': est,
                '备注': note,
            })

    if total_budget is not None or total_paid is not None:
        full_rows.append({
            '分类': '合计',
            '项目': None,
            '说明': None,
            '预估上限(¥)': total_budget,
            '实际支付(¥)': total_paid,
            '可选': None,
            '是否已订': None,
        })
        if total_budget and total_paid:
            pct = round(float(total_paid) / float(total_budget) * 100, 1)
            full_rows.append({
                '分类': f'已支付约 {pct}%（¥{total_paid:,.0f} / ¥{total_budget:,.0f}）',
                '项目': None,
                '说明': None,
                '预估上限(¥)': None,
                '实际支付(¥)': None,
                '可选': None,
                '是否已订': None,
            })

    return (
        budget_rows,
        {'title': title, 'subtitle': subtitle, 'rows': full_rows},
        {
            'title': '行前准备与携带清单',
            'subtitle': '出发前逐项勾选 · 与 Excel「预算」表同步',
            'rows': checklist_rows,
        },
    )


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
    restaurants = sheet_to_dict(wb['美食餐厅'])

    if '预算' in wb.sheetnames:
        budget, full_budget, checklist = export_merged_budget(wb['预算'])
    else:
        budget = sheet_to_dict(wb['预算明细'])
        full_budget = export_full_budget(wb['7天全预算'])
        checklist = export_checklist(wb['行前准备与携带清单'])

    food_dist = (
        sheet_to_dict(wb['美食分布'])
        if '美食分布' in wb.sheetnames
        else derive_food_dist(restaurants)
    )

    out = {
        'title': '吉隆坡之旅 2026.7.12-15',
        'subtitle': '7天6晚 · 普吉 + 吉隆坡 · 2大1小',
        'overview': sheet_to_dict(wb['行程总览']),
        'days': {},
        'foodDist': food_dist,
        'restaurants': restaurants,
        'foodRankings': export_food_rankings(wb['吉隆坡美食推荐']),
        'mapList': sheet_to_dict(wb['地图清单对照']),
        'budget': budget,
        'fullBudget': full_budget,
        'checklist': checklist,
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
    print(f'  days={len(out["days"])} foodRankings={len(out["foodRankings"])} fullBudget={len(out["fullBudget"]["rows"])} checklist={len(out["checklist"]["rows"])}')


if __name__ == '__main__':
    main()
