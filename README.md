# 吉隆坡之旅 · 动态行程网页

根据 Excel 行程表生成的交互式旅游流程页面。

## 功能

- **行程流程**：4 天时间轴，按类型配色，可切换 Day 1–4
- **实时模式**：按吉隆坡时间（UTC+8）高亮当前进行中的项目，显示当日进度条
- **标记完成**：点击「标记完成」记录进度（保存在浏览器本地）
- **总览 / 美食 / 地图 / 预算 / 行前准备**：与 Excel 各表同步

## 本地打开

需要用本地服务器（浏览器安全策略不允许直接 `file://` 加载 JSON）：

```bash
cd ~/Projects/kl-travel-guide
python3 -m http.server 8080
```

浏览器访问：**http://localhost:8080**

## 更新数据

修改 Excel 后重新导出：

```bash
python3 scripts/export_trip.py
```

（脚本读取桌面上的 `KL_Travel_Guide_2026-07-12_to_15.xlsx` 并写入 `data/trip.json`）

## 文件结构

```
kl-travel-guide/
├── index.html
├── styles.css
├── app.js
├── data/trip.json
└── scripts/export_trip.py
```
