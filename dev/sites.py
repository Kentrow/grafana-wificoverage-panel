"""Dev sites: floor layouts and AP placements, in metres, origin top left.

The floors are made to show every coverage level on one screen: well served open spaces,
offices reached through brick, a concrete auditorium and a metal server room with no AP,
an under-provisioned upper floor and a warehouse whose racks cut the signal.

An area is a rectangle whose edges become walls, except its `open` sides; `doors` cut gaps
in its edges. `segments` are standalone walls, such as racks.
"""

# Material added by the dev dashboard to the panel's defaults: loaded pallet racking.
EXTRA_MATERIALS = {"racking": {"2.4GHz": 8, "5GHz": 12, "6GHz": 14}}


def area(name, x, y, w, h, material, open_sides=(), doors=(), label=True):
    """`doors` are (side, offset from the side's start in metres, width)."""
    return {
        "name": name,
        "rect": [x, y, w, h],
        "material": material,
        "open": list(open_sides),
        "doors": [list(d) for d in doors],
        "label": label,
    }


def row(prefix, x, y, w, h, count, material, door_side, door_at=0.6, door_width=1.0):
    """A row of identical rooms, each with one door."""
    return [
        area(f"{prefix} {i + 1}", x + i * w, y, w, h, material, doors=[(door_side, door_at, door_width)])
        for i in range(count)
    ]


def segment(x1, y1, x2, y2, material):
    return {"from": [x1, y1], "to": [x2, y2], "material": material}


def aps(prefix, placements):
    """(x, y, model) in metres to named APs."""
    return [{"ap": f"{prefix}-ap{i + 1:02d}", "model": m, "x_m": x, "y_m": y} for i, (x, y, m) in enumerate(placements)]


HQ_F1 = {
    "size_m": [100, 40],
    "areas": [
        *row("Office", 0, 0, 4.5, 10, 10, "brick", "s"),
        area("Open space North", 45, 0, 35, 14, "drywall", open_sides=["s"]),
        area("Server room", 80, 0, 8, 10, "metal", doors=[("s", 3, 1.2)]),
        area("Stairs", 88, 0, 12, 10, "concrete", doors=[("s", 2, 1.5)]),
        area("Cafeteria", 0, 17, 22, 23, "glass", doors=[("n", 9, 3)]),
        *row("Meeting", 22, 17, 6, 10, 4, "glass", "n", door_at=2.5, door_width=1.0),
        area("Project space", 22, 27, 24, 13, "drywall", doors=[("e", 2, 1.5)]),
        area("Elevators", 46, 17, 10, 23, "concrete", doors=[("n", 3, 4)]),
        area("Auditorium", 56, 17, 24, 23, "concrete", doors=[("n", 2, 2), ("n", 20, 2)]),
        area("Storage", 80, 17, 20, 23, "drywall", doors=[("n", 2, 2)]),
    ],
    "segments": [segment(x, 21, x, 37, "racking") for x in (84, 88, 92, 96)],
    "aps": aps(
        "hq-f1",
        [
            (8, 12, "AP-635"),
            (30, 12, "AP-535"),
            (55, 6, "AP-635"),
            (72, 6, "AP-635"),
            (91, 15.5, "AP-535"),
            (10, 28, "AP-635"),
            (37, 22, "AP-535"),
            (98, 19, "AP-635"),
        ],
    ),
}

HQ_F2 = {
    "size_m": [100, 40],
    "areas": [
        area("Open space", 0, 0, 70, 30, "drywall", open_sides=["s", "e"], label=False),
        area("Board room", 70, 0, 20, 12, "glass", doors=[("s", 2, 1.5)]),
        area("Terrace", 90, 0, 10, 12, "glass", doors=[("w", 5, 2)]),
        area("Core", 46, 14, 10, 12, "concrete", doors=[("s", 3, 4)]),
        *row("Focus", 10, 30, 5, 10, 6, "drywall", "n", door_at=2),
        area("Lab", 78, 24, 22, 16, "brick", doors=[("w", 3, 1.5)]),
    ],
    "segments": [],
    "aps": aps(
        "hq-f2",
        [
            (14, 12, "AP-635"),
            (36, 16, "AP-635"),
            (62, 8, "AP-535"),
            (66, 33, "AP-635"),
        ],
    ),
}

# Racks run north-south with 4.8 m aisles; APs hang in the aisles.
RACK_XS = [40 + 6 * i for i in range(17)]

WAREHOUSE_F1 = {
    "size_m": [140, 60],
    "areas": [
        *row("Office", 0, 0, 10, 10, 3, "drywall", "s", door_at=4),
        area("Meeting", 0, 10, 15, 10, "glass", doors=[("e", 4, 1.2)]),
        area("Break room", 15, 10, 15, 10, "brick", doors=[("e", 4, 1.2)]),
        area("Charging", 0, 24, 24, 10, "drywall", open_sides=["e"]),
        area("Cold room", 0, 34, 24, 20, "metal", doors=[("e", 8, 3)]),
        area("Docks", 0, 54, 140, 6, "concrete", open_sides=["n"]),
    ],
    "segments": [segment(x, 6, x, 48, "racking") for x in RACK_XS],
    "aps": aps(
        "wh-f1",
        [
            (6, 5, "AP-635"),
            (24, 15, "AP-535"),
            (12, 29, "AP-535"),
            (43, 12, "AP-635"),
            (79, 12, "AP-635"),
            (115, 12, "AP-635"),
            (61, 42, "AP-635"),
            (103, 42, "AP-635"),
            (70, 57, "AP-535"),
        ],
    ),
}

SITES = {
    "hq": {"building": "Headquarters", "floors": {"1": HQ_F1, "2": HQ_F2}},
    "warehouse": {"building": "Logistics", "floors": {"1": WAREHOUSE_F1}},
}
