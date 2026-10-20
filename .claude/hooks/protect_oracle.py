"""PreToolUse hook: block file-tool writes to the oracle (tests/, SPEC.md, tasks.json),
to ANSWERS.md / REVIEW.md / VERIFY.md (only the harness records Gio's answers, review findings
and verification failures) and
to .claude/ (the guardrail settings, these hooks, and HARNESS.json's test command).

Third layer behind the Edit deny rules and the sandbox. Its job is the message: it
tells the agent what to do instead. Exit code 2 blocks the call; stderr goes to Claude.
"""
import json
import sys

import os
import pathlib

PROTECTED = ("/tests/", "/tasks.json", "/SPEC.md", "/ANSWERS.md", "/REVIEW.md", "/VERIFY.md", "/.claude/")
# Project-specific extras recorded by install.py --protect (e.g. shared types, lockfile).
harness = pathlib.Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / ".claude" / "HARNESS.json"
if harness.exists():
    PROTECTED += tuple("/" + p for p in json.loads(harness.read_text()).get("protected", []))

tool_input = json.load(sys.stdin).get("tool_input", {})
path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
if any(p in path or path.endswith(p.rstrip("/")) for p in PROTECTED):
    print(f"BLOCKED: {path} is read-only. Tests and the spec define done; "
          "you don't edit them. Claim a finished task by appending its id "
          "to claims.txt.", file=sys.stderr)
    sys.exit(2)
sys.exit(0)
