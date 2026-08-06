"""
Print every generated part, then write the manifest the app reads.

    python3 scripts/characters/process_all.py

Reads   scripts/characters/raw/{slot}/{id}.png
Writes  apps/frontend/public/characters/{slot}/{id}.webp   (+ .thumb.webp)
        apps/frontend/src/character/manifest.json
        apps/backend/assets/characters/{slot}/{id}.png     (+ manifest.json)

The API gets its own copy, as PNG, because it draws characters too now — an
invitation email carries a picture of whoever sent it (ADR-0046) and there is no
canvas on a server. PNG rather than WebP because the decoder on that side is
pure JavaScript and reads one format; the extra weight buys a container that
needs no native image library.

Both copies are written by this one run from the same measurements, so they
cannot drift the way two hand-maintained manifests would.

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
API = pathlib.Path("apps/backend/assets/characters")
MANIFEST = pathlib.Path("apps/frontend/src/character/manifest.json")

FRAME = (520, 690)

# The points everything hangs from. Chosen against the target heights in
# process.py, with margin at the top for the head to rotate into.
#
# `chin` is deliberately 30px below `neck`, and they are two points rather than
# one for a reason. Hung at the same y, the head's flat bottom edge stops
# exactly where the vest's shoulder line starts — and since the vest has an open
# neck hole, the page background shows through between them and the head reads
# as detached. Dropping the head so it overlaps closes the hole; the head is
# drawn after the body, so it covers the join rather than being cut by it.
RIG = {
    "neck": (260, 202),
    "chin": (260, 232),
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
        (API / slot).mkdir(parents=True, exist_ok=True)
        entries = []

        for index in range(len(SLOTS[slot][1])):
            name = part_id(slot, index)
            source = RAW / slot / f"{name}.png"
            if not source.exists():
                missing.append(name)
                continue

            printed, pivot = P.process(str(source), slot)
            printed.save(PUBLIC / slot / f"{name}.webp", "WEBP", quality=92, method=6)
            printed.save(API / slot / f"{name}.png", "PNG", optimize=True)

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
    (API / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    counts = {slot: len(entries) for slot, entries in manifest["slots"].items()}
    print(f"\nmanifest: {counts}")
    total = sum(f.stat().st_size for f in PUBLIC.rglob("*.webp"))
    print(f"assets:   {total / 1024:.0f} KB across {len(list(PUBLIC.rglob('*.webp')))} files")
    api_total = sum(f.stat().st_size for f in API.rglob("*.png"))
    print(f"api:      {api_total / 1024:.0f} KB across {len(list(API.rglob('*.png')))} files")

    if missing:
        print(f"\nMISSING {len(missing)}: {', '.join(missing)}")
        print("Run generate_all.py again — it skips what is already on disk.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
