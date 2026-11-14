#!/usr/bin/env python3
"""Run the frontend's own contract tests against the shipped public/data.

This replaces the pre-redesign script that replayed ``lib/mission.test.ts``.
That file and its fake-data assumptions are gone; the current checks are
``lib/science.test.ts`` (missing data, dates, blackout, mast, share URLs) and
``lib/bundled-data.test.ts`` (the real six-site assets), run by ``npm test``.

The backend does not need to duplicate those assertions in Python: the frontend
already owns the contract, and this wrapper fails if the shipped assets stop
satisfying it.

Usage
-----
    python backend/pipeline/check_frontend_tests.py
    python backend/pipeline/check_frontend_tests.py --typecheck
    python backend/pipeline/check_frontend_tests.py --build

Requires Node.js and ``node_modules`` (run ``npm ci`` in the repository root
first).  ``--build`` is the slow end-to-end check; the default is the unit and
bundled-data suite only.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def npm_executable() -> str:
    for name in ("npm.cmd", "npm"):
        path = shutil.which(name)
        if path:
            return path
    raise SystemExit("npm was not found on PATH; install Node.js 20.9+ first.")


def run(npm: str, args: list[str]) -> int:
    print(f"$ npm {' '.join(args)}   (cwd {ROOT})", flush=True)
    completed = subprocess.run([npm, *args], cwd=ROOT)
    if completed.returncode:
        print(f"FAIL  npm {' '.join(args)} exited {completed.returncode}", file=sys.stderr)
    else:
        print(f"PASS  npm {' '.join(args)}")
    return completed.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--typecheck", action="store_true",
                        help="also run npm run typecheck")
    parser.add_argument("--build", action="store_true",
                        help="also run the static production build")
    args = parser.parse_args()

    if not (ROOT / "node_modules").exists():
        print("node_modules is missing; run `npm ci` in the repository root first.",
              file=sys.stderr)
        return 2

    npm = npm_executable()
    commands = [["test"]]
    if args.typecheck:
        commands.append(["run", "typecheck"])
    if args.build:
        commands.append(["run", "build"])

    for command in commands:
        code = run(npm, command)
        if code:
            return code
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
