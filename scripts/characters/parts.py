"""
The catalogue: twenty of each part, in the 1950s mascot style (ADR-0033).

Two rules govern every line here.

**Limbs are drawn straight and vertical, joint at the top.** They get rotated
about that top end at runtime, so a limb drawn at an angle swings from the wrong
place and reads as broken no matter how good the drawing is.

**The torso is asked for as a garment, never as a body.** "A torso with no arms"
comes back with arms every time — the model draws the person it pictures and
removes nothing. A vest laid flat gives it nothing to hang limbs off.

Variants are chosen to stay apart from each other *after* the four-ink posterise.
Two heads that differ only in hair colour become the same head once both are
printed in red and cyan, so difference is carried by silhouette and pattern —
hats, hair shape, stripes, spots — rather than by hue.
"""

STYLE = (
    "1950s advertising mascot style. Bold confident brush outline of even weight. "
    "Cheerful, characterful, simple graphic shapes."
)

COMMON = (
    "Completely flat colour fill: NO shading, NO gradients, NO highlights, NO drop shadow. "
    "Palette strictly limited to warm red, process cyan blue, cream, and black. "
    "Centered, isolated on a fully transparent background, filling the frame."
)

HEAD_BASE = (
    "The HEAD piece for a jointed paper puppet: a friendly cartoon head facing forward, "
    "flat bottom edge where the neck would join. No neck, no shoulders, no body."
)

# A vest, laid flat, with nothing inside it.
BODY_BASE = (
    "A single sleeveless VEST GARMENT laid flat, cut from paper for a dressing-up doll. "
    "A rounded tank-top shape with a round neck opening at the top and two empty armholes "
    "cut at the sides. Only the garment: no person, no body, no skin, no head, no neck, "
    "no arms, no shoulders, no legs, nothing wearing it."
)

# "Tapered", "narrow" and "clearly drawn hand" are all doing work. Asked plainly
# for an arm, the model returns a broad rectangle that hangs off the figure like
# a plank — that was the main defect in the pilot.
ARM_BASE = (
    "The ARM piece for a jointed paper puppet: ONE arm held perfectly straight and vertical, "
    "narrow and gently tapered, shoulder end squared off flat at the very top, "
    "with a clearly drawn hand at the bottom end. Tall and thin, NOT a wide rectangle, "
    "NOT a plank. Just the one arm, nothing else."
)

LEG_BASE = (
    "The LEG piece for a jointed paper puppet: ONE leg held perfectly straight and vertical, "
    "narrow, hip end squared off flat at the very top, with a shoe at the bottom end. "
    "Tall and thin. Just the one leg, nothing else."
)

HEADS = [
    "tousled hair and freckles, wide open grin",
    "neatly side-parted hair, one eyebrow raised, sly smile",
    "a bowl haircut, round face, very wide surprised eyes",
    "tight curly hair and a gap-toothed smile",
    "a flat cap pulled down, winking",
    "a baseball cap worn backwards, tongue out",
    "bald with big round ears and an enormous smile",
    "two pigtails tied with ribbon, cheeks dimpled",
    "a straight bob with a heavy fringe, calm closed smile",
    "a big round afro, beaming",
    "a woolly bobble hat, rosy cheeks",
    "swimming goggles pushed up on the forehead, wet flat hair",
    "a tall chef's hat, moustache",
    "a leather flying cap with goggles, chin strap",
    "a wide cowboy hat, neckerchief knot at the jaw",
    "a construction hard hat, determined frown",
    "spiky punk hair, sticking-out tongue",
    "long straight hair parted in the middle, serene",
    "a tall top hat, monocle on one eye",
    "big headphones over the ears, eyes closed, happy",
]

BODIES = [
    "plain and undecorated",
    "bold horizontal stripes",
    "narrow vertical stripes",
    "scattered polka dots",
    "a single large star on the chest",
    "dungaree bib with two straps and a front pocket",
    "a large number 7 on the chest",
    "a checkerboard pattern",
    "a zigzag chevron band across the middle",
    "a work apron with a waist tie",
    "a buttoned waistcoat with a watch chain",
    "a lightning bolt across the chest",
    "one big patch pocket on the front",
    "an argyle diamond pattern",
    "a collar and a bow tie at the neck",
    "a life jacket with buckles",
    "a knitted cable pattern",
    "a wide sash across one shoulder",
    "small anchors printed all over",
    "a heart shape in the middle of the chest",
]

ARMS = [
    "bare, with an open flat palm",
    "a striped sleeve to the elbow, mitten hand",
    "a long plain sleeve, finger pointing downward",
    "a rolled-up sleeve, closed fist",
    "a buttoned cuff, gloved hand",
    "bare, wearing a wristwatch, relaxed fingers",
    "bandaged at the forearm, open hand",
    "a short sleeve, thumb held up",
    "a spotted sleeve, tiny hand",
    "a chunky knitted sleeve, mitten",
    "bare and freckled, splayed fingers",
    "a cuffed shirt sleeve, pinched fingers",
    "an armband above the elbow, open hand",
    "a puffed sleeve, dainty hand",
    "a work glove with a gauntlet cuff",
    "a striped sleeve, two fingers raised in a peace sign",
    "bare with a friendship bracelet, loose hand",
    "a lace trimmed sleeve, delicate hand",
    "a torn ragged sleeve, grubby hand",
    "a rubber washing-up glove to the elbow",
]

LEGS = [
    "bare, with a lace-up sneaker",
    "a striped sock and an ankle boot",
    "a long plain trouser leg and a dress shoe",
    "shorts with a bare shin and a sandal",
    "a buckled boot",
    "a roller skate",
    "a tall wellington boot",
    "a football sock and a studded boot",
    "a patched trouser leg and a scuffed shoe",
    "a turned-up jean cuff and a canvas shoe",
    "a spotted sock and a buckle shoe",
    "a knee-high sock and a school shoe",
    "a wide flared trouser leg and a platform shoe",
    "a bare leg and a flipper for swimming",
    "a woolly leg warmer and a slipper",
    "a pinstriped trouser leg and a brogue",
    "a bare knobbly knee and a hiking boot",
    "a ballet tight and a ribboned ballet shoe",
    "a snow boot with a fur cuff",
    "a bare leg and a cowboy boot with a spur",
]

SLOTS = {
    "head": (HEAD_BASE, HEADS),
    "body": (BODY_BASE, BODIES),
    "arm": (ARM_BASE, ARMS),
    "leg": (LEG_BASE, LEGS),
}


def prompt_for(slot: str, index: int) -> str:
    base, variants = SLOTS[slot]
    return f"{base} It has {variants[index]}. {STYLE} {COMMON}"


def part_id(slot: str, index: int) -> str:
    return f"{slot}-{index + 1:02d}"
