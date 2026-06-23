#!/bin/bash
# 将 Gitee + GitHub 远程仓库设为私有（使用本机钥匙串中的 Git 凭据）
set -euo pipefail

GITEE_OWNER="gsg733jwb"
GITEE_REPO="jiangwb"
GITHUB_OWNER="gsg733jwb-oss"
GITHUB_REPO="jiangwb"

read_git_credential() {
  local host="$1"
  python3 - <<'PY' "$host"
import subprocess, sys
host = sys.argv[1]
p = subprocess.run(
    ["git", "credential", "fill"],
    input=f"protocol=https\nhost={host}\n\n",
    text=True,
    capture_output=True,
    check=True,
)
user = password = ""
for line in p.stdout.splitlines():
    if line.startswith("username="):
        user = line.split("=", 1)[1]
    elif line.startswith("password="):
        password = line.split("=", 1)[1]
print(user)
print(password)
PY
}

set_gitee_private() {
  local creds user pass resp
  creds="$(read_git_credential "gitee.com")"
  user="$(echo "$creds" | sed -n '1p')"
  pass="$(echo "$creds" | sed -n '2p')"
  if [[ -z "$pass" ]]; then
    echo "Gitee：未找到钥匙串凭据" >&2
    return 1
  fi
  resp="$(curl -sS -X PATCH \
    "https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}?access_token=${pass}" \
    -d "private=true")"
  if echo "$resp" | grep -qE '"private"\s*:\s*true'; then
    echo "Gitee：已设为私有 ✓"
    return 0
  fi
  echo "Gitee API：$resp" >&2
  return 1
}

set_github_private() {
  local creds user pass resp
  creds="$(read_git_credential "github.com")"
  user="$(echo "$creds" | sed -n '1p')"
  pass="$(echo "$creds" | sed -n '2p')"
  if [[ -z "$pass" ]]; then
    echo "GitHub：未找到钥匙串凭据" >&2
    return 1
  fi
  resp="$(curl -sS -X PATCH \
    -H "Authorization: Bearer ${pass}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}" \
    -d '{"private":true}')"
  if echo "$resp" | grep -qE '"private"\s*:\s*true'; then
    echo "GitHub：已设为私有 ✓"
    return 0
  fi
  echo "GitHub API：$resp" >&2
  return 1
}

echo "正在将 ${GITEE_OWNER}/${GITEE_REPO} 与 ${GITHUB_OWNER}/${GITHUB_REPO} 设为私有…"
echo ""
ok=0
set_gitee_private && ok=$((ok + 1)) || true
set_github_private && ok=$((ok + 1)) || true
echo ""
if [[ "$ok" -eq 2 ]]; then
  echo "两端均已私有（源码不公开）。"
  echo "对外网页：push 到 github 后由 GitHub Pages 发布（仓库可私有）。"
  echo "  ./scripts/push_guide.sh --github"
elif [[ "$ok" -ge 1 ]]; then
  echo "部分成功，另一端请手动设置："
  echo "  Gitee:  https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}/settings#privacy"
  echo "  GitHub: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/settings"
  exit 1
else
  echo "自动设置失败，请手动操作："
  echo "  Gitee:  仓库 → 管理 → 仓库设置 → 是否开源 → 私有"
  echo "  GitHub: Settings → General → Danger zone → Change repository visibility"
  exit 1
fi
