"""Stop hook: refuse to end a session while a task already marked passing has regressed.

Inactive until Stage 1 creates tasks.json. It deliberately does NOT require the whole
suite to be green: under the claims design the suite stays red until the last task.
"""
import json
import os
import pathlib
import subprocess
import sys

event = json.load(sys.stdin)
# Only worker sessions are held to "fix regressions before ending". A guardrail probe that
# met this hook rewrote real code to get out of it (2026-10-18), so other session kinds
# (set by the harness in HARNESS_SESSION_KIND) pass straight through.
if os.environ.get("HARNESS_SESSION_KIND", "worker") != "worker":
    sys.exit(0)
if event.get("stop_hook_active"):
    sys.exit(0)                                # already continued once; let it stop
tasks_file = pathlib.Path("tasks.json")
if not tasks_file.exists():
    sys.exit(0)
tasks = json.loads(tasks_file.read_text())
must_pass = [t for task in tasks if task.get("passes") for t in task.get("tests", [])]
if must_pass:
    # The project's test command, recorded by install.py (pytest for older installs).
    harness = pathlib.Path(".claude/HARNESS.json")
    cmd = json.loads(harness.read_text()).get("test_cmd") if harness.exists() else None
    if not cmd:
        venv_python = pathlib.Path(".venv/bin/python")   # the project's interpreter has pytest
        python = str(venv_python) if venv_python.exists() else sys.executable
        cmd = [python, "-m", "pytest", "-q", "-p", "no:cacheprovider"]
    r = subprocess.run([*cmd, *must_pass], capture_output=True, text=True,
                       env=dict(os.environ, NO_COLOR="1"))
    if r.returncode != 0:
        print("BLOCKED: tests for tasks already marked passing now fail. "
              "Fix the regression before ending.\n" + r.stdout[-1500:], file=sys.stderr)
        sys.exit(2)
sys.exit(0)
