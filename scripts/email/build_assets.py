"""
The art an invitation email is built from.

    python3 scripts/email/build_assets.py

Reads   scripts/scenery/raw/{piece}.png
Writes  apps/backend/assets/email/{piece}.png

Through `scripts/characters/process.py` **unchanged**, like the scenery is —
which is what guarantees the starburst behind somebody's character in an email
and the potted palm they are standing next to on the stage came off the same
press. The consistency is mechanical rather than a matter of getting a prompt
right, and that is the whole reason the characters worked (ADR-0033).

Nothing new is generated. The starburst the email wants already exists in the
scenery catalogue, in exactly the right style, and asking the image model for a
second one would cost money to arrive somewhere slightly worse. Add a piece to
`PIECES` and to `scripts/scenery/catalogue.py` if the email ever needs art the
stage does not have.
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent / "characters"))

from PIL import Image  # noqa: E402

import process as P  # noqa: E402

RAW = pathlib.Path("scripts/scenery/raw")
OUT = pathlib.Path("apps/backend/assets/email")

# Wider than anything on the stage, because an email hero is looked at closely
# rather than at a quarter of the screen behind a character who is moving.
PIECES = {"burst": 900}

# The outline width and the halftone pitch are in **pixels**. Printing a piece
# larger without scaling them gives a proportionally thinner outline and a finer
# screen, so the same art stops matching everything else in the app. Scaled with
# the size, which is the only reason this file does not just call `P.process`.
SCALE = 3


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    key_edge, screen = P.add_key_edge, P.screen
    P.add_key_edge = lambda im, width=2: key_edge(im, width=width * SCALE)
    P.screen = lambda im, pitch=5, strength=26: screen(im, pitch=pitch * SCALE, strength=strength)

    try:
        for piece, width in PIECES.items():
            source = RAW / f"{piece}.png"
            if not source.exists():
                print(f"  {piece:<10} MISSING — run scripts/scenery/generate_all.py")
                return 1

            image = P.harden_alpha(Image.open(source).convert("RGBA"))
            box = image.getbbox()
            if box:
                image = image.crop(box)
            image = image.resize((width, round(width * image.height / image.width)), Image.LANCZOS)
            image = P.screen(P.add_key_edge(P.to_inks(P.despeckle(image))))

            image.save(OUT / f"{piece}.png", "PNG", optimize=True)
            print(f"  {piece:<10} {image.size[0]}x{image.size[1]}")
    finally:
        P.add_key_edge, P.screen = key_edge, screen

    total = sum(f.stat().st_size for f in OUT.glob("*.png"))
    print(f"\nemail art: {total / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
