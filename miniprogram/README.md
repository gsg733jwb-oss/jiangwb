# 出行攻略 · 微信小程序

可复用多行程：每次出行一份 Excel + `trip.config.json` 登记，同步后小程序内可切换历史行程。

## 首次开通

1. 注册 [微信公众平台](https://mp.weixin.qq.com) 小程序，获取 **AppID**
2. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
3. 打开项目目录：`kl-travel-guide/miniprogram`
4. 在 `project.config.json` 把 `appid` 改成你的 AppID
5. 预览 / 上传体验版

## 日常使用（与网页共用 Excel）

```bash
# 1. 编辑 马泰攻略/KL_Travel_Guide_*.xlsx
# 2. 同步（网页 + 小程序数据一起更新）
python3 scripts/export_trip.py

# 或双击：马泰攻略/运行/同步行程到网页.command
```

3. 微信开发者工具点 **编译** 或 **上传**（数据已在 `miniprogram/data/`）

## 新增一趟行程

```bash
# Excel 先放到 马泰攻略/
python3 scripts/new_trip.py \
  --title "东京之旅 2027.4" \
  --excel "Tokyo_2027.xlsx" \
  --date-start 2027-04-01 \
  --date-end 2027-04-07 \
  --timezone Asia/Tokyo \
  --active

python3 scripts/export_trip.py --trip-id <上一步生成的 id>
```

## 更新旧行程

在 `马泰攻略/trip.config.json` 中把 `activeTripId` 改为目标 id，或：

```bash
python3 scripts/export_trip.py --trip-id kl-2026-07
```

历史数据保存在 `miniprogram/data/all-trips.json`，不会覆盖其他 id。

## 目录说明

| 文件 | 作用 |
|------|------|
| `马泰攻略/trip.config.json` | 行程登记簿（id / Excel / 日期 / 时区） |
| `miniprogram/data/manifest.json` | 小程序首页行程列表 |
| `miniprogram/data/all-trips.json` | 全部行程 JSON（按 id） |
| `miniprogram/data/all-places.json` | 各地点坐标（按 id） |

## 与网页差异

- 地图使用微信原生 `map` 组件（腾讯底图）
- 勾选/展开状态按 **行程 id** 分开存储
- 机票监控脚本仍在 Mac 桌面运行，不在小程序内
