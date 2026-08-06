"""
The scenery catalogue: the rooms the characters stand in.

Everything here goes through the *character* pipeline unchanged —
`scripts/characters/process.py` — because that is what guarantees a potted palm
and a player's head look like they were printed on the same press. The
consistency is mechanical rather than a matter of getting the prompts right,
which is the whole reason the characters worked (ADR-0033).

Two rules govern every line.

**Objects only, never people.** A backdrop with a painted figure in it would
compete with the actual players standing in front of it.

**Every piece is a separate cut-out.** One flat painted scene cannot have a
character walk *behind* the armchair. Props are placed on the stage with a depth
value and sorted against the players, which is what turns a picture into a room.

Sizes are in stage units: the stage is 1600×900 and a character stands about
340 tall, so a 400-unit lamp reads as slightly taller than a person.
"""

STYLE = (
    "1950s advertising illustration style. Bold confident brush outline of even weight. "
    "Simple graphic shapes, cheerful, characterful."
)

COMMON = (
    "Completely flat colour fill: NO shading, NO gradients, NO highlights, NO drop shadow. "
    "Palette strictly limited to warm red, process cyan blue, cream, and black. "
    "NO people, NO characters, NO figures, NO hands. "
    "Centered, isolated on a fully transparent background, filling the frame."
)

# `height` is the piece's size in stage units. `wide` marks the pieces that are
# scaled to the stage *width* instead — a wall or a floor has to span it
# regardless of how tall the drawing came back.
SCENERY = {
    # ---- the lobby: a comfortable waiting room -------------------------------
    "lobby-wall": {
        "height": 620,
        "wide": True,
        "prompt": (
            "A flat section of patterned wallpaper for a 1950s living room, seen straight on. "
            "A simple repeating motif on a pale ground, with a picture rail along the top. "
            "Just the wall surface, edge to edge, no furniture and no window."
        ),
    },
    "lobby-floor": {
        "height": 340,
        "wide": True,
        "prompt": (
            "A flat section of 1950s parquet floorboards seen from a low angle, "
            "receding slightly. Just the floor surface, edge to edge, nothing on it."
        ),
    },
    "lobby-window": {
        "height": 420,
        "prompt": (
            "A tall 1950s window with glazing bars and open curtains at each side, "
            "daylight showing through the glass. Seen straight on. Just the window."
        ),
    },
    "lobby-lamp": {
        "height": 400,
        "prompt": "A 1950s standing floor lamp with a conical shade and thin tapered legs, switched on.",
    },
    "lobby-palm": {
        "height": 380,
        "prompt": "A potted palm house plant in a ceramic pot, broad arching leaves.",
    },
    "lobby-armchair": {
        "height": 230,
        "prompt": "A 1950s upholstered armchair with wooden tapered legs, seen from the front.",
    },
    "lobby-sofa": {
        "height": 240,
        "prompt": "A 1950s two-seater sofa with wooden tapered legs and buttoned cushions, seen from the front.",
    },
    "lobby-table": {
        "height": 160,
        "prompt": "A small 1950s side table with splayed legs and a magazine lying on top.",
    },
    "lobby-clock": {
        "height": 120,
        "prompt": "A 1950s starburst wall clock with pointed rays and a plain round face.",
    },
    "lobby-picture-a": {
        "height": 130,
        "prompt": "A framed picture for a wall: a simple abstract shape in a thin rectangular frame.",
    },
    "lobby-picture-b": {
        "height": 110,
        "prompt": "A framed picture for a wall: a simple sailing boat in a thin oval frame.",
    },
    "lobby-rug": {
        "height": 120,
        "prompt": "An oval woven rug seen from a low angle, concentric bands, lying flat on a floor.",
    },
    "lobby-coatstand": {
        "height": 430,
        "prompt": "A tall wooden coat stand with curved pegs and a hat hanging on one of them.",
    },
    "lobby-radiator": {
        "height": 160,
        "prompt": "A cast-iron column radiator seen straight on, standing against a wall.",
    },
    "lobby-bin": {
        "height": 110,
        "prompt": "A small metal wastepaper basket with a perforated pattern.",
    },
    "lobby-sign": {
        "height": 140,
        "prompt": (
            "A hanging shop sign board on two short chains, blank rectangular face with a "
            "decorative border and no writing on it."
        ),
    },
    # ---- room 01: somewhere you would rather not be --------------------------
    "vault-wall": {
        "height": 620,
        "wide": True,
        "prompt": (
            "A flat section of riveted metal wall panels for an industrial vault, seen straight on. "
            "Rows of rivets along the seams. Just the wall surface, edge to edge, nothing on it."
        ),
    },
    "vault-floor": {
        "height": 340,
        "wide": True,
        "prompt": (
            "A flat section of square tiled concrete floor seen from a low angle, receding "
            "slightly. Just the floor surface, edge to edge, nothing on it."
        ),
    },
    "vault-door": {
        "height": 520,
        "prompt": (
            "A heavy round vault door with a spoked turning wheel in the middle and thick hinges, "
            "closed, seen straight on. The door alone as a cut-out shape: NO wall around it, "
            "NO square frame, NO background panel, NO backing rectangle."
        ),
    },
    "vault-crate-a": {
        "height": 170,
        "prompt": "A wooden shipping crate with plank seams and corner brackets.",
    },
    "vault-crate-b": {
        "height": 140,
        "prompt": "A small wooden shipping crate lying on its side, planks and corner brackets.",
    },
    "vault-barrel": {
        "height": 180,
        "prompt": "A metal barrel standing upright, banded hoops around it.",
    },
    "vault-pipes": {
        "height": 320,
        "prompt": "A run of industrial pipework with elbow joints, valve wheels and flanges, against a wall.",
    },
    "vault-cabinet": {
        "height": 300,
        "prompt": "A tall metal filing cabinet with four drawers and pull handles, one drawer slightly open.",
    },
    "vault-desk": {
        "height": 210,
        "prompt": "A plain metal work desk with a drawer and sturdy legs, seen from the front.",
    },
    "vault-bulb": {
        "height": 280,
        "prompt": "A bare light bulb hanging from a long flex with a shallow metal shade, switched on.",
    },
    "vault-vent": {
        "height": 130,
        "prompt": "A rectangular wall vent grille with horizontal louvres and corner screws.",
    },
    "vault-chain": {
        "height": 320,
        "prompt": "A length of heavy chain hanging vertically from above, thick oval links.",
    },
    "vault-warning": {
        "height": 130,
        "prompt": (
            "A triangular hazard warning sign with a thick border and a bold exclamation mark in "
            "the middle. The triangular sign alone as a cut-out shape: NO wall, NO square frame, "
            "NO background panel, NO backing rectangle."
        ),
    },
    "vault-clock": {
        "height": 130,
        "prompt": "An industrial round wall clock in a heavy metal bezel with bold numerals.",
    },
    "vault-locker": {
        "height": 330,
        "prompt": "A tall metal locker with a louvred door, a handle and a small ventilation grille.",
    },
    # ---- decoration used by the effects --------------------------------------
    "splat-a": {
        "height": 300,
        "prompt": (
            "A single bold ink splat blot with irregular edges and a few flung droplets around it. "
            "The blot alone as a cut-out shape: NO frame, NO border lines, NO background panel, "
            "nothing else in the image at all."
        ),
    },
    "splat-b": {
        "height": 300,
        "prompt": "A single round ink stamp blot with a rough uneven edge, like a rubber stamp impression.",
    },
    "splat-c": {
        "height": 300,
        "prompt": "A starburst comic impact shape with sharp radiating points, solid fill.",
    },
    "burst": {
        "height": 340,
        "prompt": "A comic book radiating speed-line burst, thin triangular rays pointing outward from a clear centre.",
    },
}


def prompt_for(name: str) -> str:
    return f"{SCENERY[name]['prompt']} {STYLE} {COMMON}"
