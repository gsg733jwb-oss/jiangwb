"""iMessage 通知。"""

from __future__ import annotations

import subprocess
import textwrap


def send_imessage(recipient: str, message: str) -> None:
    recipient_literal = recipient.replace('"', '\\"')
    chunks = _split_message(message, 1800)
    for chunk in chunks:
        script = textwrap.dedent(
            f"""
            tell application "Messages"
                set targetService to 1st service whose service type = iMessage
                set targetBuddy to participant "{recipient_literal}" of targetService
                send "{_escape_applescript(chunk)}" to targetBuddy
            end tell
            """
        ).strip()
        proc = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "iMessage 发送失败")


def _escape_applescript(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _split_message(message: str, limit: int) -> list[str]:
    if len(message) <= limit:
        return [message]
    parts: list[str] = []
    current = ""
    for line in message.splitlines():
        candidate = f"{current}\n{line}".strip() if current else line
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        while len(line) > limit:
            parts.append(line[:limit])
            line = line[limit:]
        current = line
    if current:
        parts.append(current)
    return parts
