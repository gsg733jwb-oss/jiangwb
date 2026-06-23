# 吉隆坡之旅 · 动态行程网页

根据 Excel 生成交互式行程页（**对外网页** + **Gitee 私有备份** + 微信小程序）。

| 部分 | 说明 |
|------|------|
| 对外网页 | https://gsg733jwb-oss.github.io/jiangwb/ |
| Gitee 备份 | 私有仓，完整代码与脚本 |
| GitHub | 公开仓，仅用于免费版 GitHub Pages 发布静态页 |
| 桌面「马泰攻略」 | Excel、机票监控，不入库 |

## 同步与发布

```bash
python3 scripts/export_trip.py          # Excel → 网页 + 小程序数据

./scripts/push_guide.sh                 # 私有备份 → Gitee
./scripts/push_guide.sh --github      # 更新对外网页 → GitHub Pages
```

## 本地预览

双击 `马泰攻略/运行/打开行程网页.command`，或：

```bash
cd ~/Projects/kl-travel-guide && python3 -m http.server 8080 --bind 127.0.0.1
```

## 新增行程

见 `miniprogram/README.md` 与 `scripts/new_trip.py`。
