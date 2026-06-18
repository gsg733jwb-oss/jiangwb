# 吉隆坡之旅 · 动态行程网页

根据 Excel 行程表生成的交互式旅游流程页面，支持**地图定位**与**公网访问**。

## 在线地址（部署后）

**https://gsg733jwb-oss.github.io/clover/**

（需先按下方步骤 push 并开启 GitHub Pages）

## 功能

- **行程流程**：4 天时间轴，吉隆坡实时高亮当前活动
- **地图**：显示你的 GPS 位置 + 全部行程地点，可筛选天数、一键导航
- **总览 / 美食 / 清单 / 预算 / 行前**：与 Excel 同步

## 部署到公网（GitHub Pages）

### 1. 推送代码

```bash
cd ~/Projects/kl-travel-guide
git add .
git commit -m "Add map and GitHub Pages deploy"
git push -u origin master
```

若远程默认分支是 `main`：

```bash
git push -u origin master:main
```

### 2. 开启 Pages

1. 打开 https://github.com/gsg733jwb-oss/clover/settings/pages
2. **Source** 选 **GitHub Actions**
3. 等几分钟，Actions 跑完后即可通过上述链接访问

### 3. 更新行程数据

改完桌面 Excel 后：

```bash
python3 scripts/export_trip.py
git add data/trip.json && git commit -m "Update trip data" && git push
```

## 本地预览

```bash
cd ~/Projects/kl-travel-guide
python3 -m http.server 8080
# http://localhost:8080
```

> 地图定位在 `localhost` 上可能受限，**公网 HTTPS 页面**定位最稳定。

## 文件结构

```
kl-travel-guide/
├── index.html
├── styles.css
├── app.js
├── map.js
├── data/
│   ├── trip.json
│   └── places.json    # 地图坐标
├── scripts/export_trip.py
└── .github/workflows/pages.yml
```
