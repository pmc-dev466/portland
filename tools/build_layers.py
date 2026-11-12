"""Split the source illustration into the layers the WebGL scene animates.

Outputs (assets/):
  base.webp    scene with sails and gulls painted out
  rotor.png    sails un-projected to a frontal view (rotated + re-projected at runtime)
  pole.png     static spindle drawn over the rotor
  clouds.webp  cloud sprites lifted from the painting (2x2 atlas, straight alpha)
  maskA.png    R solid (island/buildings)  G foliage sway  B stream
  maskB.png    R waterfall  G emissive (windows, lantern)  B light halo
  maskC.png    distance-ish falloff around solid shapes
  scene.json   geometry + sky gradient the runtime needs

Run:  python tools/build_layers.py
"""
import json
import os
import sys

import cv2
import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (ASSETS, BOTTOM_PAINTED, CANON, CANON_C, DEBUG, HUB, HUB_RADIUS, POLE,
                    SIZE, TIPS, blade_strip, ellipse_mask, load_source, poly_mask,
                    rotor_homography, save, spread_colors, wood_key)

rng = np.random.default_rng(7)
img = load_source()
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
Hh, Ss, Vv = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
key = wood_key(img)


def dilate(m, r):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m, k)


def erode(m, r):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.erode(m, k)


def blur(m, s):
    return cv2.GaussianBlur(m, (0, 0), s)


# --------------------------------------------------------------------------- rotor
pole_poly = poly_mask(POLE)
hub_disc = ellipse_mask(HUB[0], HUB[1], HUB_RADIUS, HUB_RADIUS)
clean_strips = np.zeros_like(key)
for name in ("top", "right", "left"):
    clean_strips |= poly_mask(blade_strip(TIPS[name]))
sail = key & (clean_strips | hub_disc) & ~pole_poly
# drop specks
n, lab, stats, _ = cv2.connectedComponentsWithStats(sail, connectivity=8)
keep = np.isin(lab, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 60])
sail = (keep * 255).astype(np.uint8)

painted_bottom = key & poly_mask(BOTTOM_PAINTED)

sail_alpha = blur(sail.astype(np.float32), 0.8)
sail_rgb = spread_colors(img, erode(sail, 1))
Hm = rotor_homography()
Hinv = np.linalg.inv(Hm)
canon_rgb = cv2.warpPerspective(sail_rgb, Hinv, (CANON, CANON), flags=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_REPLICATE)
canon_a = cv2.warpPerspective(sail_alpha, Hinv, (CANON, CANON), flags=cv2.INTER_LINEAR)
canon = np.dstack([canon_rgb, np.clip(canon_a, 0, 255).astype(np.uint8)])
# Rebuild the bottom sail from the left one (a quarter turn in the rotor plane).
cy, cx = np.mgrid[0:CANON, 0:CANON].astype(np.float32)
dx, dy = cx - CANON_C, cy - CANON_C
rad = np.hypot(dx, dy)
bottom_sector = (dy > np.abs(dx)) & (rad > 62)
quarter = np.rot90(canon, 1)
canon = np.where(bottom_sector[..., None], quarter, canon)
canon[rad > CANON / 2 - 2] = 0
canon[dilate(canon[..., 3], 3) == 0] = 0
save(os.path.join(ASSETS, "rotor.png"), canon, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# spindle overlay
px0, py0, px1, py1 = 956, 488, 1108, 528
pole_m = key & dilate(pole_poly, 1)
pole_a = blur(pole_m.astype(np.float32), 0.7)
pole_rgb = spread_colors(img, pole_m)
pole = np.dstack([pole_rgb, np.clip(pole_a, 0, 255).astype(np.uint8)])[py0:py1, px0:px1]
save(os.path.join(ASSETS, "pole.png"), pole, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# ---------------------------------------------------------------------- clean base
bird_boxes = [(1455, 225, 1600, 330), (1425, 475, 1545, 565)]
birds = np.zeros_like(key)
for x0, y0, x1, y1 in bird_boxes:
    sub = (Ss[y0:y1, x0:x1] < 95) & (Vv[y0:y1, x0:x1] > 185)
    birds[y0:y1, x0:x1] = sub * 255
birds = dilate(birds, 5)

erase_zone = np.zeros_like(key)
for name in ("top", "right", "left"):
    erase_zone |= poly_mask(blade_strip(TIPS[name], far=48, half=128))
erase_zone[(yy > 738) & (xx < 1050)] = 0            # keep the orange tree
erase_zone |= hub_disc | poly_mask(BOTTOM_PAINTED)
erase = dilate(key & erase_zone, 4) | birds
erase |= dilate(pole_m, 3)


def smooth_fill(src, hole, sigma):
    """Normalised convolution: fills thin holes from their surroundings, no streaks."""
    known = (hole == 0).astype(np.float32)
    num = cv2.GaussianBlur(src.astype(np.float32) * known[..., None], (0, 0), sigma)
    den = cv2.GaussianBlur(known, (0, 0), sigma)
    return num / np.maximum(den, 1e-3)[..., None]


fill = smooth_fill(img, erase, 6.0)
fill = np.where((cv2.GaussianBlur((erase == 0).astype(np.float32), (0, 0), 6.0) < 0.05)[..., None],
                smooth_fill(img, erase, 16.0), fill)
fill += rng.normal(0, 1.6, img.shape[:2]).astype(np.float32)[..., None]
near_hub = np.clip(1.5 - np.hypot(xx - HUB[0], yy - HUB[1]) / 80.0, 0, 1)[..., None]
erase &= ~ellipse_mask(HUB[0], HUB[1], 27, 27)
telea = cv2.inpaint(img, erase, 4, cv2.INPAINT_TELEA).astype(np.float32)
fill = fill * (1 - near_hub) + telea * near_hub
soft = blur(erase.astype(np.float32) / 255, 1.2)[..., None]
base = np.clip(img * (1 - soft) + fill * soft, 0, 255).astype(np.uint8)

# Tower body behind the painted bottom sail: sail, its lattice shadow and the
# half-hidden window are replaced by a smooth shading model fitted to clean wall.
TL, BL = (1113, 612), (1104, 770)      # left silhouette
TR, BR = (1313, 610), (1325, 845)      # right silhouette


def edge_x(p0, p1, y):
    return p0[0] + (p1[0] - p0[0]) * (y - p0[1]) / (p1[1] - p0[1])


xl, xr = edge_x(TL, BL, yy), edge_x(TR, BR, yy)
xrel = (xx - xl) / (xr - xl)
ytop = 613 + 6 * np.sin(np.pi * np.clip(xrel, 0, 1))
body = (xrel > 0) & (xrel < 1) & (yy > ytop) & (yy < 845)
roof = dilate(poly_mask([(1040, 792), (1060, 748), (1164, 750), (1242, 860), (1100, 872)]), 3) > 0
win_right = poly_mask([(1272, 612), (1322, 612), (1322, 702), (1272, 702)]) > 0
win_left = poly_mask([(1138, 615), (1194, 615), (1194, 705), (1138, 705)]) > 0
green = (Hh > 28) & (Hh < 95) & (Ss > 70)

yrel = (yy - 612) / 233.0
basis = np.stack([np.ones_like(xrel), xrel, xrel ** 2, xrel ** 3, yrel, xrel * yrel], -1)
fit_ok = body & ~roof & ~win_right & ~win_left & ~dilate(green.astype(np.uint8) * 255, 4).astype(bool)
fit_ok &= ~(dilate(key, 4) > 0)
A = basis[fit_ok]
model = np.zeros(img.shape, np.float32)
for c in range(3):
    b = img[..., c][fit_ok].astype(np.float32)
    w = np.ones_like(b)
    for _ in range(12):  # upper-envelope fit: shadows and bricks are darker outliers
        coef, *_ = np.linalg.lstsq(A * w[:, None], b * w, rcond=None)
        res = b - A @ coef
        w = np.where(res < -4.0, 0.05, 1.0)
    model[..., c] = basis @ coef

zone_line = edge_x((1222, 612), (1306, 800), yy)   # everything left of the sail's far edge
zone = body & (xx < zone_line) & (yy < 816) & ~roof
zone_soft = blur(zone.astype(np.float32), 2.5) * erode(body.astype(np.uint8), 1) * (~roof)
zone_soft = np.clip(zone_soft * 1.6 - 0.3, 0, 1)
band = np.clip((xx - zone_line - 6) / 34.0, 0, 1)                  # fade into the real shaded wall
band = (1 - band * band * (3 - 2 * band)) * (xx >= zone_line) * body * (yy < 816) * (~roof)
band *= 1 - blur(dilate(win_right.astype(np.uint8) * 255, 3).astype(np.float32) / 255, 3)
zone_soft = np.maximum(zone_soft, band)[..., None]
grain = rng.normal(0, 1.1, img.shape[:2]).astype(np.float32)[..., None]
basef = base.astype(np.float32)
basef = basef * (1 - zone_soft) + (model + grain) * zone_soft

# Re-create the hidden left window from the visible right one (mirrored, re-lit).
sx0, sy0, sx1, sy1 = 1272, 612, 1322, 704
patch = img[sy0:sy1, sx0:sx1].astype(np.float32) - model[sy0:sy1, sx0:sx1]
patch = patch[:, ::-1]
tcx = 1165
tx0 = tcx - (sx1 - sx0) // 2
feather = np.zeros(patch.shape[:2], np.float32)
feather[6:-6, 6:-6] = 1
feather = blur(feather, 3)[..., None]
dst = basef[sy0:sy1, tx0:tx0 + (sx1 - sx0)]
dst[:] = dst * (1 - feather) + (model[sy0:sy1, tx0:tx0 + (sx1 - sx0)] + patch) * feather
# The ring under the cap was hidden by the sail root: mirror its clean right half.
AXIS = 1213.0
neck = (xrel > -0.01) & (xx < 1246) & (yy > 572 + 7 * np.sin(np.pi * np.clip(xrel, 0, 1))) & (yy <= ytop + 1)
mx = np.clip(np.round(2 * AXIS - xx).astype(int), 0, SIZE - 1)
mx = np.where(mx < 1246, 1246 + (yy.astype(int) % 4), mx)        # clean columns only
mirrored = img[yy.astype(int), mx].astype(np.float32)
lit = np.clip((AXIS - xx) / 100.0, 0, 1)[..., None]
mirrored *= 1 + lit * np.array([0.02, 0.10, 0.16])       # BGR: warmer towards the sun
neck_soft = (blur(neck.astype(np.float32), 1.5) * np.clip((1246 - xx) / 6.0, 0, 1))[..., None]
basef = basef * (1 - neck_soft) + mirrored * neck_soft
base = np.clip(basef, 0, 255).astype(np.uint8)
save(os.path.join(ASSETS, "base.webp"), base, [cv2.IMWRITE_WEBP_QUALITY, 93])

# --------------------------------------------------------------------------- masks
bh = cv2.cvtColor(base, cv2.COLOR_BGR2HSV)
H2, S2, V2 = bh[..., 0].astype(int), bh[..., 1].astype(int), bh[..., 2].astype(int)
B2, G2, R2 = [base[..., i].astype(int) for i in range(3)]

water_zone = poly_mask([(600, 1170), (760, 1170), (835, 1300), (805, 1500), (590, 1500), (590, 1300)]) > 0
water = water_zone & (H2 > 90) & (H2 < 116) & (S2 > 70) & (V2 > 60)
water = cv2.morphologyEx(water.astype(np.uint8) * 255, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

skyish = (H2 > 88) & (H2 < 122) & (V2 > 150)                 # sky, cloud shade
cloudish = ((S2 < 60) & (V2 > 180)) | ((V2 > 222) & (S2 < 95) & (B2 > 185))
structures = (poly_mask([(1104, 612), (1090, 560), (1150, 470), (1245, 455), (1330, 545), (1318, 612),
                         (1332, 960), (1100, 960)])           # tower + cap
              | poly_mask([(1005, 985), (1012, 850), (1060, 745), (1170, 750), (1245, 860), (1245, 990)])
              ) > 0
solid = (~(skyish | cloudish)) | structures | (water > 0)
solid &= ~(dilate(pole_m, 2) > 0)
solid = cv2.morphologyEx(solid.astype(np.uint8) * 255, cv2.MORPH_OPEN,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
n, lab, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
solid = ndimage.binary_fill_holes(lab == biggest)
solid = cv2.morphologyEx(solid.astype(np.uint8) * 255, cv2.MORPH_CLOSE,
                         cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
solid_soft = blur(solid.astype(np.float32), 1.2)

# foliage sway: weight grows from the trunk base to the crown
TREES = [  # (polygon, trunk base, hue test)
    ([(1300, 700), (1400, 660), (1520, 670), (1610, 760), (1620, 900), (1560, 960), (1330, 960), (1280, 860)],
     (1452, 985), "green"),
    ([(880, 800), (930, 750), (1010, 755), (1040, 800), (1030, 880), (960, 905), (890, 880)], (985, 905), "orange"),
    ([(828, 925), (860, 890), (905, 900), (918, 950), (890, 985), (840, 978)], (880, 990), "orange"),
    ([(690, 880), (640, 1010), (625, 1080), (760, 1085), (750, 1000), (712, 880)], (697, 1095), "green"),
    ([(1075, 1320), (1120, 1290), (1185, 1300), (1200, 1370), (1150, 1400), (1085, 1385)], (1140, 1400), "orange"),
    ([(795, 1335), (850, 1300), (960, 1310), (975, 1400), (900, 1430), (800, 1410)], (880, 1430), "green"),
    ([(895, 915), (930, 890), (985, 900), (995, 975), (905, 985)], (945, 990), "green"),
]
is_green = (H2 > 26) & (H2 < 95) & (S2 > 60)
is_orange = ((H2 < 24) | (H2 > 170)) & (S2 > 110)
sway = np.zeros((SIZE, SIZE), np.float32)
for poly, (bx, by), kind in TREES:
    pm = poly_mask(poly) > 0
    m = pm & (is_green if kind == "green" else is_orange)
    m = ndimage.binary_fill_holes(cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))
    ys = np.where(m.any(axis=1))[0]
    if len(ys) == 0:
        continue
    height = np.clip((by - yy) / max(by - ys.min(), 1), 0, 1)
    sway = np.maximum(sway, m * (0.25 + 0.75 * height))
grass = is_green & (solid > 0) & (sway == 0)
sway = np.maximum(blur(sway, 7), blur(grass.astype(np.float32), 3) * 0.22)

fall_split = 1318 + (1292 - 1318) * (xx - 600) / 190.0  # lip of the waterfall
stream = (water > 0) & (yy < fall_split)
fall = (water > 0) & (yy >= fall_split)
maskA = np.dstack([blur(stream.astype(np.float32), 2.5) * 255, sway * 255, solid_soft]).clip(0, 255)
save(os.path.join(ASSETS, "maskA.png"), maskA.astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])

LIGHTS = [  # emissive shapes: (cx, cy, rx, ry)
    (1066, 837, 11, 17),    # gable window
    (1067, 902, 14, 10),    # fanlight over the door
    (1176, 913, 11, 27),    # side window
    (1103, 925, 6, 9),      # lantern
    (1296, 655, 11, 28),    # tower window (right)
    (1166, 655, 11, 28),    # tower window (left)
]
emis = np.zeros((SIZE, SIZE), np.uint8)
for cx_, cy_, rx_, ry_ in LIGHTS:
    emis |= ellipse_mask(cx_, cy_, rx_, ry_)
glass = (B2 > R2 - 25) & (V2 < 215)            # panes, not the frames or the wall
lantern = ellipse_mask(1103, 925, 6, 9) > 0
emis_f = ((emis > 0) & (glass | lantern)).astype(np.float32)
halo = np.clip(blur(emis.astype(np.float32) / 255, 34) * 3.2 + blur(emis.astype(np.float32) / 255, 9) * 0.9, 0, 1)
maskB_full = np.dstack([halo * 255, blur(emis_f, 1.0) * 255, blur(fall.astype(np.float32), 2.5) * 255]).clip(0, 255)
maskB = cv2.resize(maskB_full.astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA)
save(os.path.join(ASSETS, "maskB.png"), maskB, [cv2.IMWRITE_PNG_COMPRESSION, 9])

near = blur(dilate(solid, 12).astype(np.float32), 14)
maskC = cv2.resize(near.clip(0, 255).astype(np.uint8), (512, 512), interpolation=cv2.INTER_AREA)
save(os.path.join(ASSETS, "maskC.png"), maskC, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# ----------------------------------------------------------------------- sky model
pure_sky = (H2 > 95) & (H2 < 112) & (S2 > 75) & (V2 > 150) & (solid == 0)
pure_sky &= ~(dilate(cloudish.astype(np.uint8) * 255, 9) > 0)
def fit_sky(x0, x1):
    """Robust per-row sky colour (BGR polynomials in v) from a band of columns."""
    rows, cols = [], []
    for y in range(SIZE):
        sel = pure_sky[y, x0:x1]
        if sel.sum() > 0.3 * (x1 - x0):
            rows.append(y / (SIZE - 1))
            cols.append(np.median(base[y, x0:x1][sel].astype(np.float32), axis=0))
    rows, cols = np.array(rows), np.array(cols)
    polys = []
    for c in range(3):
        w = np.ones(len(rows))
        for _ in range(8):
            poly = np.polyfit(rows, cols[:, c], 4, w=w)
            w = (np.abs(cols[:, c] - np.polyval(poly, rows)) < 5.0).astype(float) + 1e-3
        polys.append(poly)
    return polys


def lut_from(polys):
    vc = np.clip(v_lut, 0, 1)
    over = v_lut - vc
    lut = np.stack([np.polyval(p, vc) + np.polyval(np.polyder(p), vc) * over * 0.4 for p in polys], -1)
    return np.clip(lut, 0, 255)[:, ::-1]  # -> RGB


v_lut = np.linspace(-0.6, 1.6, 256)
sky_left, sky_right = fit_sky(0, 70), fit_sky(SIZE - 70, SIZE)
sky_lut = np.stack([lut_from(sky_left), lut_from(sky_right)])           # [side, v, rgb]
vrow = yy[:, 0] / (SIZE - 1)
row_l = np.stack([np.polyval(p, vrow) for p in sky_left], -1)[:, None, :]
row_r = np.stack([np.polyval(p, vrow) for p in sky_right], -1)[:, None, :]
ucol = (xx[0] / (SIZE - 1))[None, :, None]
sky_full = row_l * (1 - ucol) + row_r * ucol                             # BGR, full frame

# ------------------------------------------------------------------- cloud sprites
CELL = 512
SPRITES = [  # x0, y0, x1, y1 in base
    (430, 150, 1010, 660),
    (0, 950, 470, 1470),
    (290, 630, 720, 1000),
]
atlas = np.zeros((CELL * 2, CELL * 2, 4), np.uint8)
sprite_meta = []
for i, (x0, y0, x1, y1) in enumerate(SPRITES):
    c = base[y0:y1, x0:x1].astype(np.float32)
    s = sky_full[y0:y1, x0:x1]
    white = np.array([238.0, 242.0, 252.0])  # BGR of the brightest cloud tops
    a = ((c - s) / np.maximum(white - s, 1.0))[..., 2]  # red channel separates best
    a = np.clip((a - 0.12) / 0.75, 0, 1)
    a *= 1 - blur(solid[y0:y1, x0:x1].astype(np.float32) / 255, 6).clip(0, 1)
    h, w = a.shape
    fy = np.minimum(np.arange(h), h - 1 - np.arange(h))[:, None] / (0.22 * h)
    fx = np.minimum(np.arange(w), w - 1 - np.arange(w))[None, :] / (0.22 * w)
    edge = np.clip(np.minimum(fx, fy), 0, 1)
    a *= edge * edge * (3 - 2 * edge)
    a = blur(a, 1.0)
    f = (c - (1 - a[..., None]) * s) / np.maximum(a[..., None], 0.04)
    trust = np.clip((a[..., None] - 0.10) / 0.40, 0, 1)   # thin edges: no colour fringe
    f = np.clip(white * (1 - trust) + f * trust, 0, 255)
    rgba = np.dstack([f, a * 255]).astype(np.uint8)
    scale = min(CELL / w, CELL / h)
    nw, nh = int(w * scale), int(h * scale)
    rgba = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_AREA)
    ox, oy = (i % 2) * CELL, (i // 2) * CELL
    atlas[oy:oy + nh, ox:ox + nw] = rgba
    sprite_meta.append({"u": ox / (2 * CELL), "v": oy / (2 * CELL), "w": nw / (2 * CELL),
                        "h": nh / (2 * CELL), "aspect": w / h, "srcWidth": w})
atlas[atlas[..., 3] == 0] = 0
save(os.path.join(ASSETS, "clouds.webp"), atlas, [cv2.IMWRITE_WEBP_QUALITY, 92])

# --------------------------------------------------------------------------- json
scene = {
    "size": SIZE,
    "hub": HUB,
    "rotor": {"canon": CANON, "Hinv": (Hinv / Hinv[2, 2]).flatten().tolist(),
              "bounds": [HUB[0] - 400, HUB[1] - 400, HUB[0] + 400, HUB[1] + 400]},
    "pole": [px0, py0, px1, py1],
    "skyLut": np.round(sky_lut).astype(int).tolist(),
    "skyLutRange": [-0.6, 1.6],
    "clouds": sprite_meta,
    "birds": [[1525, 280], [1480, 525]],
    "lights": [[c[0], c[1]] for c in LIGHTS],
}
with open(os.path.join(ASSETS, "scene.json"), "w") as fh:
    json.dump(scene, fh)

# -------------------------------------------------------------------------- debug
if os.environ.get("PORTLAND_DEBUG_DIR"):
    save(os.path.join(DEBUG, "base_mill.png"), base[120:880, 800:1460])
    save(os.path.join(DEBUG, "base_small.png"), cv2.resize(base, (1024, 1024), interpolation=cv2.INTER_AREA))
    save(os.path.join(DEBUG, "maskA_small.png"), cv2.resize(maskA.astype(np.uint8), (1024, 1024)))
    save(os.path.join(DEBUG, "maskB_small.png"), maskB)
    chk = np.full(atlas.shape[:2] + (3,), (150, 110, 60), np.float32)
    al = atlas[..., 3:4] / 255.0
    save(os.path.join(DEBUG, "clouds.png"), (atlas[..., :3] * al + chk * (1 - al)).astype(np.uint8))
    cb = np.full((CANON, CANON, 3), 40, np.float32)
    al = canon[..., 3:4] / 255.0
    save(os.path.join(DEBUG, "rotor.png"), (canon[..., :3] * al + cb * (1 - al)).astype(np.uint8))
print("ok")
