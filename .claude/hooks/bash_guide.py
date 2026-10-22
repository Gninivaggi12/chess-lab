"""PreToolUse hook (Bash): block a shell command the session isn't allowed to run, with a
message that says what to do instead.

Without it, Claude Code's own denial tells the agent to "STOP and explain to the user ...
Let the user decide how to proceed." Unattended, there is no user, so agents ended their
sessions there, sometimes with work uncommitted (LOG 2026-10-21, UXD: `cat > file` and
`sed -i` were denied, and the agent wrote "Bash was denied" and stopped).

It only ever adds a block, never a permission: a command it lets through still faces the
allowlist and the sandbox. The allowlist is the session's own (HARNESS_ALLOWED_TOOLS, set
by run_session), so probes that allow extra commands still reach the sandbox they test.
No HARNESS_ALLOWED_TOOLS (an interactive session): do nothing.
Exit code 2 blocks the call; stderr goes to Claude.
"""
import json
import os
import re
import sys


def bash_patterns(allowed):
    return [t[5:-1] for t in allowed.split(",") if t.startswith("Bash(") and t.endswith(")")]


def matches(segment, pattern):
    if pattern.endswith(" *"):
        base = pattern[:-2]
        return segment == base or segment.startswith(base + " ")
    if pattern.endswith("*"):
        return segment.startswith(pattern[:-1])
    return segment == pattern


def unquoted(command):
    """The command with quoted strings emptied, so `|`, `;` or `>` inside a commit message
    don't count. Only the first line: later lines are heredoc bodies."""
    first = command.strip().splitlines()[0] if command.strip() else ""
    return re.sub(r"'[^']*'|\"(?:\\.|[^\"\\])*\"", '""', first)


REDIRECT = re.compile(r"(?<![0-9&<>])>>?\s*(?!&|/dev/null)")


def problem(command, patterns):
    line = unquoted(command)
    if REDIRECT.search(line):
        return "it writes a file with a shell redirect (>)"
    for seg in re.split(r"&&|\|\||[;|]", line):
        seg = seg.strip()
        if seg and not any(matches(seg, p) for p in patterns):
            return f"`{seg.split()[0]}` is not on this session's command list"
    return None


def main():
    allowed = os.environ.get("HARNESS_ALLOWED_TOOLS")
    if allowed is None:
        sys.exit(0)
    command = json.load(sys.stdin).get("tool_input", {}).get("command", "")
    patterns = bash_patterns(allowed)
    why = problem(command, patterns)
    if why:
        print(f"BLOCKED by the harness: {why}. This is expected, not an error, and not a "
              "reason to stop: keep working. To create or change a file, use the Write or "
              "Edit tool (not cat, sed, tee or echo with >). Shell commands allowed in this "
              "session: " + ", ".join(patterns) + ".",
              file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


if __name__ == "__main__":
    main()
