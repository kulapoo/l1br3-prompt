#!/usr/bin/env bash
set -euo pipefail

echo "Building l1br3 backend..."
uv run pyinstaller l1br3.spec --clean

echo ""
echo "Build complete: dist/l1br3"
