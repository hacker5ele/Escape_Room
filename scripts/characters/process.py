"""
Turn a generated part into a printed one.

The model returns something that *looks* flat and is not: one pilot head held
16,744 distinct opaque colours and a 9% band of partial alpha around its edge.
Left alone, eighty of those never look like one set — the drift between them is
exactly what reads as machine-made.

So every part goes through the same narrow pipeline, and the narrowness is the
point: two parts that look unrelated in full colour look like siblings once both
are four flat inks with a hard edge and the same screen over them.
"""

from __future__ import annotations

import colorsys
from dataclasses import dataclass

from PIL import Image, ImageFilter

# Overprint's inks (ADR-0032). Nothing here invents a colour.
PAPER = (0xED, 0xE7, 0xD6)
INK_A = (0xE8, 0x45, 0x2E)
INK_B = (0x0B, 0x7F, 0xBF)
KEY = (0x18, 0x16, 0x0F)


@dataclass(frozen=True)
class Slot:
    name: str
    target_height: int
    """Every part in a slot ends this tall, so scale never depends on framing."""
    max_width_ratio: float | None = None
    """Widest the part may be, as a fraction of its height. Limbs only."""


SLOTS = {
    "head": Slot("head", 190),
    "body": Slot("body", 235),
    "arm": Slot("arm", 205, max_width_ratio=0.30),
    "leg": Slot("leg", 215, max_width_ratio=0.34),
}
# These are not independent numbers. Head plus body plus leg has to land inside
# the frame in assemble.py with margin for the head to rotate into, and the head
# has to stay large enough to read at avatar size. The first pilot used the
# model's own framing and the figure ran off the top and bottom of the canvas.


def harden_alpha(im: Image.Image, threshold: int = 128) -> Image.Image:
    """
    Make the edge a decision rather than a gradient.

    A soft edge is what makes a cut-out look pasted on, and it fights the hard
    key outline added below — the outline would sit on top of a fading ghost of
    the original.
    """
    alpha = im.getchannel("A").point(lambda v: 255 if v >= threshold else 0)
    im.putalpha(alpha)
    return im


def despeckle(im: Image.Image, size: int = 3) -> Image.Image:
    """
    Smooth the antialiasing before it gets quantised.

    Posterizing is a hard decision made per pixel, so the soft band the model
    leaves between two fills becomes a scatter of stray dots — one pixel lands
    on one side of a threshold, its neighbour on the other. Median-filtering
    first pushes those pixels to whichever fill they are actually nearer, and
    the edges come out clean instead of chewed.
    """
    rgb = Image.merge("RGB", im.split()[:3]).filter(ImageFilter.MedianFilter(size))
    return Image.merge("RGBA", (*rgb.split(), im.getchannel("A")))


def to_inks(im: Image.Image) -> Image.Image:
    """
    Collapse everything to four values.

    Decided in HSV rather than by nearest RGB distance, because nearest-RGB
    sends mid greys somewhere arbitrary and loses what the drawing meant. Here
    the rule follows intent: dark is the key plate, pale is bare paper, and
    anything with colour in it goes to whichever ink is closer round the wheel.
    """
    out = Image.new("RGBA", im.size)
    src = im.load()
    dst = out.load()

    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = src[x, y]
            if a == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue

            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            degrees = h * 360

            if v < 0.30:
                colour = KEY
            elif s < 0.30:
                # No real colour in it, so the only question is light or dark.
                # Deciding this on brightness rather than forcing it to key
                # matters more than it sounds: pale skin and pale card are
                # desaturated, and sending them to black turned a hand into a
                # patch of speckle in the first pilot.
                colour = PAPER if v > 0.52 else KEY
            else:
                # Distance round the hue wheel to each ink's own hue.
                warm = min(abs(degrees - 8), 360 - abs(degrees - 8))
                cool = min(abs(degrees - 200), 360 - abs(degrees - 200))
                colour = INK_A if warm <= cool else INK_B

            dst[x, y] = (*colour, 255)

    return out


def add_key_edge(im: Image.Image, width: int = 2) -> Image.Image:
    """
    A key stroke around the silhouette.

    The model draws its own outline inside the shape, but not consistently and
    never on the outermost edge. This one is ours and identical on all eighty,
    which is most of what makes a set look like a set.

    Keep `width` small. `MaxFilter` uses a *square* kernel, so a wide dilation
    does not round a narrow shape, it squares it off — at width 5 every arm came
    out as a black slab, because an 11-pixel square grown from a 70-pixel-wide
    limb simply fills the silhouette's corners in. Two pixels reads as a printed
    edge; five reads as a mistake.
    """
    alpha = im.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(width * 2 + 1))

    edged = Image.new("RGBA", im.size, (*KEY, 0))
    edged.putalpha(grown)
    edged.paste(im, (0, 0), im)
    return edged


def screen(im: Image.Image, pitch: int = 5, strength: int = 26) -> Image.Image:
    """
    A halftone screen over everything.

    This is the step that does the most work against looking generated: image
    models produce smooth or dithered fills, never a regular dot screen, so a
    real one reads as something that came off a press. Kept subtle — it is a
    print artefact, not a filter.
    """
    dots = Image.new("L", im.size, 0)
    paint = dots.load()
    radius = pitch / 3.0

    for cy in range(0, im.size[1] + pitch, pitch):
        for cx in range(0, im.size[0] + pitch, pitch):
            for y in range(int(cy - radius), int(cy + radius) + 1):
                if not 0 <= y < im.size[1]:
                    continue
                for x in range(int(cx - radius), int(cx + radius) + 1):
                    if 0 <= x < im.size[0] and (x - cx) ** 2 + (y - cy) ** 2 <= radius**2:
                        paint[x, y] = strength

    darkened = Image.new("RGBA", im.size, (0, 0, 0, 0))
    darkened.putalpha(Image.composite(dots, Image.new("L", im.size, 0), im.getchannel("A")))

    out = im.copy()
    out.alpha_composite(darkened)
    return out


def fit(im: Image.Image, slot: Slot) -> Image.Image:
    """
    Trim to what is actually drawn, then make every part in the slot one size.

    Height is the primary constraint, but limbs also get a width ceiling. Asked
    for an arm, the model quite often returns a broad rectangle, and scaled to
    height alone that hangs off the figure as a slab rather than a limb. Where
    it is too wide, scale by width instead and accept a shorter part — a limb
    that is slightly short reads as a limb, one that is twice too wide does not.
    """
    box = im.getbbox()
    if box:
        im = im.crop(box)

    scale = slot.target_height / im.size[1]
    if slot.max_width_ratio is not None:
        widest = slot.target_height * slot.max_width_ratio
        if im.size[0] * scale > widest:
            scale = widest / im.size[0]

    return im.resize(
        (max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))),
        Image.LANCZOS,
    )


def pivot_of(im: Image.Image, slot_name: str) -> tuple[int, int]:
    """
    The point this part turns about, and the point it is hung from.

    Not the same edge for every slot. A limb swings from its top — the shoulder
    or the hip — so its pivot is top-centre. A head turns about the neck, which
    is at the *bottom* of the drawing, so it hangs downward-anchored instead.
    Getting this wrong is not subtle: a head pivoted at its crown swings like a
    pendulum instead of turning to look at you.

    Recorded per part rather than assumed, so anything drawn with its joint
    somewhere odd can be corrected in the manifest without touching this code.
    """
    width, height = im.size
    if slot_name == "head":
        return (width // 2, height)
    return (width // 2, 0)


def process(path: str, slot_name: str) -> tuple[Image.Image, tuple[int, int]]:
    slot = SLOTS[slot_name]
    im = Image.open(path).convert("RGBA")

    im = harden_alpha(im)
    im = fit(im, slot)
    im = despeckle(im)
    im = to_inks(im)
    im = add_key_edge(im)
    im = screen(im)

    return im, pivot_of(im, slot_name)


if __name__ == "__main__":
    import sys

    source, slot_name, destination = sys.argv[1], sys.argv[2], sys.argv[3]
    result, pivot = process(source, slot_name)
    result.save(destination)
    print(f"{destination}  {result.size[0]}x{result.size[1]}  pivot={pivot}")
