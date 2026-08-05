"""
Print every generated part, then write the manifest the app reads.

    python3 scripts/characters/process_all.py

Reads   scripts/characters/raw/{slot}/{id}.png
Writes  apps/frontend/public/characters/{slot}/{id}.webp   (+ .thumb.webp)
        apps/frontend/src/character/manifest.json

The manifest is generated rather than hand-written because the numbers in it —
each part's size and where it hangs from — are measurements of the finished
image. Typing them by hand would mean they drift from the art the first time a
part is regenerated.
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from PIL import Image  # noqa: E402

import process as P  # noqa: E402
from parts import SLOTS, part_id  # noqa: E402

RAW = pathlib.Path("scripts/characters/raw")
PUBLIC = pathlib.Path("apps/frontend/public/characters")
MANIFEST = pathlib.Path("apps/frontend/src/character/manifest.json")

FRAME = (520, 690)

# The five points everything hangs from. Chosen against the target heights in
# process.py, with margin at the top for the head to rotate into.
RIG = {
    "neck": (260, 202),
    "shoulderL": (188, 240),
    "shoulderR": (332, 240),
    "hipL": (224, 428),
    "hipR": (296, 428),
}

THUMB_HEIGHT = 96


def main() -> int:
    manifest: dict = {"frame": list(FRAME), "rig": {k: list(v) for k, v in RIG.items()}, "slots": {}}
    missing: list[str] = []

    for slot in SLOTS:
        (PUBLIC / slot).mkdir(parents=True, exist_ok=True)
        entries = []

        for index in range(len(SLOTS[slot][1])):
            name = part_id(slot, index)
            source = RAW / slot / f"{name}.png"
            if not source.exists():
                missing.append(name)
                continue

            printed, pivot = P.process(str(source), slot)
            printed.save(PUBLIC / slot / f"{name}.webp", "WEBP", quality=92, method=6)

            thumbnail = printed.copy()
            thumbnail.thumbnail(
                (THUMB_HEIGHT * 2, THUMB_HEIGHT), Image.LANCZOS
            )
            thumbnail.save(PUBLIC / slot / f"{name}.thumb.webp", "WEBP", quality=88, method=6)

            entries.append({
                "id": name,
                "w": printed.size[0],
                "h": printed.size[1],
                "pivot": list(pivot),
            })
            print(f"  {name:<10} {printed.size[0]:>3}x{printed.size[1]:<3} pivot={pivot}")

        manifest["slots"][slot] = entries

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    counts = {slot: len(entries) for slot, entries in manifest["slots"].items()}
    print(f"\nmanifest: {counts}")
    total = sum(f.stat().st_size for f in PUBLIC.rglob("*.webp"))
    print(f"assets:   {total / 1024:.0f} KB across {len(list(PUBLIC.rglob('*.webp')))} files")

    if missing:
        print(f"\nMISSING {len(missing)}: {', '.join(missing)}")
        print("Run generate_all.py again — it skips what is already on disk.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
