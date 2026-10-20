"""Writes the API's OpenAPI schema; the TypeScript client types are generated from it.

    python -m app.export_openapi            # -> packages/api-client/openapi.json
    python -m app.export_openapi out.json   # -> somewhere else

Writes the file itself (UTF-8) rather than printing, because PowerShell's `>` would save
it as UTF-16.
"""

import json
import sys
from pathlib import Path

from app.main import app

# backend/app/export_openapi.py -> repo root. In Docker, backend/ is /app, so this resolves
# to /packages/api-client, which docker-compose mounts.
DEFAULT_PATH = Path(__file__).resolve().parents[2] / "packages" / "api-client" / "openapi.json"


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    target.write_text(json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
