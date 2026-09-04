#!/usr/bin/env bash
# Test, build, and publish the Python SDK (yeriasdk) to PyPI. Requires
# ~/.pypirc configured with the target index credentials.
#
# `python` is not `python3` everywhere — on macOS it can still resolve to the
# system Python 2.7, which fails on the first pip invocation. Prefer the
# project venv when there is one, then python3, and let PYTHON override.
set -euo pipefail
cd "$(dirname "$0")/../py"

if [ -n "${PYTHON:-}" ]; then
  PY="$PYTHON"
elif [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3"
fi

echo "[publish-py] interpreter: $("$PY" -c 'import sys; print(sys.executable, sys.version.split()[0])')"

"$PY" -m pip install --upgrade build twine
"$PY" -m pytest
rm -rf dist
"$PY" -m build
"$PY" -m twine check dist/*
"$PY" -m twine upload dist/*
