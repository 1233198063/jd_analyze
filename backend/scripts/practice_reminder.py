"""
Desktop reminder to practice, run hourly by Windows Task Scheduler through pythonw.exe (so no
console window flashes). It reads the database directly — Postgres runs as a service, while the
API server often isn't running — and shows a Windows toast only when a reminder is due: past the
reminder time, on a plan day, nothing logged yet today, and no reminder in the last 2 hours.

Usage (from anywhere):
  .venv\\Scripts\\pythonw.exe scripts\\practice_reminder.py         # normal hourly run
  .venv\\Scripts\\python.exe  scripts\\practice_reminder.py --now   # show a toast right away (testing)
"""
import asyncio
import base64
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

BACKEND_DIR = Path(__file__).resolve().parent.parent
# Settings reads .env relative to the working directory, and Task Scheduler starts in System32.
os.chdir(BACKEND_DIR)
sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import AsyncSessionLocal, engine  # noqa: E402
from app.services import practice_service  # noqa: E402

PRACTICE_URL = "http://localhost:5173/practice"
LOG_FILE = BACKEND_DIR / "logs" / "practice_reminder.log"
# Windows PowerShell's own AppUserModelID: lets a script raise a toast without registering an app.
POWERSHELL_APP_ID = r"{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"


def log(message: str) -> None:
    LOG_FILE.parent.mkdir(exist_ok=True)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}\n")


def show_toast(title: str, body: str, url: str) -> None:
    toast_xml = (
        f"<toast activationType=\"protocol\" launch={quoteattr(url)}>"
        f"<visual><binding template=\"ToastGeneric\">"
        f"<text>{escape(title)}</text><text>{escape(body)}</text>"
        f"</binding></visual>"
        f"<actions><action content=\"Open practice\" activationType=\"protocol\" arguments={quoteattr(url)}/></actions>"
        f"</toast>"
    )
    # Sent as -EncodedCommand (UTF-16 base64): no shell quoting, and non-ASCII text such as "·"
    # survives. Piping it to "-Command -" instead silently runs nothing under -NonInteractive.
    script = "\n".join([
        "$ErrorActionPreference = 'Stop'",
        "$ProgressPreference = 'SilentlyContinue'",
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
        "[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
        "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
        "$xml.LoadXml(@'",
        toast_xml,
        "'@)",
        "$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
        f"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{POWERSHELL_APP_ID}').Show($toast)",
    ])
    encoded = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    result = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        capture_output=True,
        text=True,
        errors="replace",
        timeout=30,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"powershell exited {result.returncode}")


async def main(force: bool) -> None:
    try:
        async with AsyncSessionLocal() as db:
            status = await practice_service.today_status(db)
            settings = await practice_service.get_settings(db)
            now = datetime.now().astimezone()
            if not force and not practice_service.reminder_due(settings, now, status["checked_in"]):
                await db.commit()  # keep the settings row if this run created it
                return
            title, body = practice_service.reminder_message(status)
            show_toast(title, body, PRACTICE_URL)
            if not force:
                settings.last_reminded_at = now
            await db.commit()
            log(f"reminded: {title}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main(force="--now" in sys.argv))
    except Exception as exc:  # pythonw has no console, so failures only surface in the log
        log(f"error: {exc!r}")
        raise
