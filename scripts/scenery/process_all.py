"""
Print the scenery, then write the manifest the stage reads.

    python3 scripts/scenery/process_all.py

Every piece goes through the *character* pipeline — `scripts/characters/
process.py` — completely unchanged. That is the point: a potted palm and a
player's head come off the same press, so they cannot drift apart. Only the
sizing differs, because a wall and an arm want different treatment.
"""

from __future__ import annotations

import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.append(str(HERE.parent / "characters"))

from PIL import Image  # noqa: E402

import process as P  # noqa: E402  — the character pipeline, as-is
from catalogue import SCENERY  # noqa: E402

RAW = pathlib.Path("scripts/scenery/raw")
PUBLIC = pathlib.Path("apps/frontend/public/scenery")
MANIFEST = pathlib.Path("apps/frontend/src/stage/scenery.json")

# The stage's own coordinate space. Everything on it — props, characters,
# positions on the wire — is expressed in these units and scaled once by CSS,
# so nothing has to know the size of the window it ended up in.
STAGE = (1600, 900)


def fit(image: Image.Image, height: int, wide: bool) -> Image.Image:
    """
    Trim to what is drawn, then size it.

    A prop is sized by its height, because that is what makes a lamp read as
    taller than a person. A wall or a floor is sized by width instead — it has
    to span the stage regardless of how tall the drawing came back.
    """
    box = image.getbbox()
    if box:
        image = image.crop(box)

    scale = (STAGE[0] / image.size[0]) if wide else (height / image.size[1])
    return image.resize(
        (max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale))),
        Image.LANCZOS,
    )


def main() -> int:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    pieces: dict[str, dict] = {}
    missing: list[str] = []

    for name, spec in SCENERY.items():
        source = RAW / f"{name}.png"
        if not source.exists():
            missing.append(name)
            continue

        image = Image.open(source).convert("RGBA")
        image = P.harden_alpha(image)
        image = fit(image, spec["height"], spec.get("wide", False))
        image = P.despeckle(image)
        image = P.to_inks(image)
        # A wall or a floor is a surface, not an object, so it gets no outline —
        # a key line around the whole room would box the stage in.
        if not spec.get("wide", False):
            image = P.add_key_edge(image)
        image = P.screen(image)

        image.save(PUBLIC / f"{name}.webp", "WEBP", quality=92, method=6)
        pieces[name] = {"w": image.size[0], "h": image.size[1]}
        print(f"  {name:<18} {image.size[0]:>4}x{image.size[1]}")

    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps({"stage": list(STAGE), "pieces": pieces}, indent=2) + "\n")

    total = sum(f.stat().st_size for f in PUBLIC.glob("*.webp"))
    print(f"\n{len(pieces)}/{len(SCENERY)} pieces, {total / 1024:.0f} KB")
    if missing:
        print(f"MISSING {len(missing)}: {', '.join(missing)}")
        print("Run generate_all.py again — it skips what is already on disk.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
