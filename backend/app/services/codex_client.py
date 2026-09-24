"""
Runs prompts through the locally installed Codex CLI (`codex exec`), which is signed in with a
ChatGPT account — so AI features draw on that plan instead of a paid OpenAI API key.
"""
import glob
import os
import shutil
import subprocess
import tempfile

from app.core.config import settings

# Plain text generation needs none of Codex's agent tooling. Turning it off skips connector and
# plugin startup (which otherwise logs MCP transport errors on every call) and trims ~25% of the
# prompt tokens Codex adds per call.
_DISABLED_FEATURES = [
    "apps", "plugins", "remote_plugin", "browser_use", "browser_use_external", "computer_use",
    "image_generation", "multi_agent", "goals", "hooks", "shell_tool", "unified_exec",
    "skill_search", "tool_suggest", "in_app_browser", "view_image",
]


class CodexError(RuntimeError):
    pass


def find_codex() -> str:
    if settings.CODEX_PATH:
        return settings.CODEX_PATH
    on_path = shutil.which("codex")
    if on_path:
        return on_path
    # The Codex desktop app copies its CLI into a hash-named folder that changes on each app update.
    bundled = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "OpenAI", "Codex", "bin", "*", "codex.exe"))
    if bundled:
        return max(bundled, key=os.path.getmtime)
    raise CodexError("Codex CLI not found — install the Codex app or set CODEX_PATH in backend/.env")


def run_prompt(prompt: str) -> str:
    """Runs one prompt through `codex exec` and returns the model's final message."""
    codex = find_codex()
    with tempfile.TemporaryDirectory(prefix="jd-analyze-codex-") as workdir:
        out_file = os.path.join(workdir, "last_message.txt")
        cmd = [
            codex, "exec",
            "--ephemeral", "--skip-git-repo-check", "--ignore-user-config",
            "--sandbox", "read-only", "--cd", workdir,
            "--model", settings.CODEX_MODEL,
            "-c", f'model_reasoning_effort="{settings.CODEX_REASONING_EFFORT}"',
            "--output-last-message", out_file,
        ]
        for feature in _DISABLED_FEATURES:
            cmd += ["--disable", feature]
        cmd.append("-")  # prompt via stdin — resumes/JDs are too long for a command line

        try:
            proc = subprocess.run(
                cmd,
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=settings.CODEX_TIMEOUT_SECONDS,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except subprocess.TimeoutExpired as e:
            raise CodexError(f"Codex timed out after {e.timeout}s") from e

        if proc.returncode != 0 or not os.path.exists(out_file):
            detail = (proc.stderr or proc.stdout or "").strip()[-800:]
            raise CodexError(f"codex exec failed (exit {proc.returncode}): {detail}")
        with open(out_file, encoding="utf-8") as f:
            text = f.read().strip()

    if not text:
        raise CodexError("Codex returned an empty response")
    return text


def extract_json_object(text: str) -> str:
    """Pulls the JSON object out of a reply that may wrap it in prose or ``` fences."""
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        raise CodexError(f"Expected a JSON object from Codex, got: {text[:200]}")
    return text[start:end + 1]
