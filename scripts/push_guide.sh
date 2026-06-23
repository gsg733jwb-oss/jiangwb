#!/bin/bash
# 推送 kl-travel-guide 到 Gitee（默认）或 GitHub
set -euo pipefail

REPO="${KL_TRAVEL_REPO:-$HOME/Projects/kl-travel-guide}"
REMOTE="origin"
BRANCH=""
DO_PULL=0
MESSAGE=""

usage() {
  cat <<'EOF'
用法: push_guide.sh [选项]

  默认推送到 Gitee（origin/master，私有备份）。

  更新对外网页请用 --github（私有仓 + GitHub Pages 公开发布）。

选项:
  --github       推送到 GitHub（github remote）
  --branch NAME  指定分支（默认当前分支）
  --pull         推送前先 pull --rebase
  -m "说明"      有未提交改动时自动 add + commit 再 push
  -h, --help     显示帮助

示例:
  ./scripts/push_guide.sh
  ./scripts/push_guide.sh --pull
  ./scripts/push_guide.sh -m "更新行程与地图"
  ./scripts/push_guide.sh --github
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --github) REMOTE="github"; shift ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --pull) DO_PULL=1; shift ;;
    -m) MESSAGE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 1 ;;
  esac
done

cd "$REPO" || { echo "找不到仓库: $REPO" >&2; exit 1; }

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git branch --show-current)"
fi
if [[ -z "$BRANCH" ]]; then
  echo "无法确定当前分支" >&2
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "远程 $REMOTE 不存在" >&2
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  推送攻略 · $REMOTE / $BRANCH"
echo "  仓库: $REPO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ -z "$MESSAGE" ]]; then
    echo "有未提交改动，请先 commit，或使用 -m \"说明\" 自动提交："
    echo ""
    git status -sb
    exit 1
  fi
  echo "提交未保存改动…"
  git add -A
  git commit -m "$MESSAGE"
  echo ""
fi

if [[ "$DO_PULL" -eq 1 ]]; then
  echo "拉取并变基 $REMOTE/$BRANCH …"
  git pull --rebase "$REMOTE" "$BRANCH"
  echo ""
fi

AHEAD="$(git rev-list --count "${REMOTE}/${BRANCH}"..HEAD 2>/dev/null || echo 0)"
if [[ "${AHEAD:-0}" -eq 0 ]] && git rev-parse "${REMOTE}/${BRANCH}" >/dev/null 2>&1; then
  echo "没有需要推送的新提交（已与 $REMOTE/$BRANCH 同步）。"
  exit 0
fi

echo "推送 ${AHEAD:-?} 个提交 → $REMOTE $BRANCH …"
git push -u "$REMOTE" "$BRANCH"

echo ""
echo "完成: $(git remote get-url "$REMOTE") ($BRANCH)"
if [[ "$REMOTE" == "github" ]]; then
  echo "对外网页（Pages 部署后）: https://gsg733jwb-oss.github.io/jiangwb/"
fi
