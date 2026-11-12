"""Shared helpers for the layer-extraction pipeline."""
import glob
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
DEBUG = os.environ.get("PORTLAND_DEBUG_DIR", os.path.join(ROOT, "tools", "_debug"))
SIZE = 2048

# Rotor geometry in source-image pixels.
HUB = (1128.0, 505.0)
# Blade tips (top, right, bottom, left). Opposite tips are collinear with the hub
# so the canonical rotor centre projects exactly onto the hub. The painted bottom
# sail is slightly bent; it is rebuilt from a clean sail, so its tip is idealised.
TIPS = {
    "top": (985.0, 190.0),
    "right": (1395.0, 308.0),
    "bottom": (1247.0, 767.0),
    "left": (875.0, 690.0),
}
# Where the painted (bent) bottom sail actually is; only used to erase it.
BOTTOM_PAINTED = [(1095, 535), (1108, 610), (1158, 722), (1200, 815), (1215, 815),
                  (1302, 752), (1244, 600), (1238, 555), (1175, 520)]
# Static spindle that sticks out of the hub towards the viewer.
POLE = [(966, 508), (966, 520), (1100, 512), (1100, 496)]
HUB_RADIUS = 46

CANON = 1024           # canonical (frontal) rotor texture size
CANON_C = (CANON - 1) / 2.0
CANON_R = 440.0


def load_source():
    path = glob.glob(os.path.join(ROOT, "resources", "*.png"))[0]
    img = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[:2] == (SIZE, SIZE), img.shape
    return img


def save(path, img, params=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ext = os.path.splitext(path)[1]
    ok, buf = cv2.imencode(ext, img, params or [])
    assert ok, path
    buf.tofile(path)


def poly_mask(points, shape=(SIZE, SIZE)):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(points, np.int32)], 255)
    return m


def ellipse_mask(cx, cy, rx, ry, shape=(SIZE, SIZE)):
    m = np.zeros(shape, np.uint8)
    cv2.ellipse(m, (int(cx), int(cy)), (int(rx), int(ry)), 0, 0, 360, 255, -1)
    return m


def wood_key(img):
    """Binary mask of the saturated red-orange wood of the windmill sails."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return (((h <= 22) | (h >= 172)) & (s > 95) & (v > 70)).astype(np.uint8) * 255


def blade_strip(tip, near=20, far=28, half=100):
    """Generous oriented rectangle around a blade axis (hub -> tip)."""
    hub = np.array(HUB)
    d = np.array(tip) - hub
    length = np.linalg.norm(d)
    d /= length
    p = np.array([-d[1], d[0]])
    a, b = hub + d * near, hub + d * (length + far)
    return [a - p * half, a + p * half, b + p * half, b - p * half]


def rotor_homography():
    """Canonical frontal rotor (tips at 90deg steps on a circle) -> image pixels."""
    c, r = CANON_C, CANON_R
    canon = np.float32([[c, c - r], [c + r, c], [c, c + r], [c - r, c]])
    src = np.float32([TIPS["top"], TIPS["right"], TIPS["bottom"], TIPS["left"]])
    return cv2.getPerspectiveTransform(canon, src).astype(np.float64)


def spread_colors(img, core, sigma=3.0, rounds=3):
    """Bleed colours of `core` pixels outward so soft alpha edges carry no fringe."""
    out = img.astype(np.float32)
    known = (core > 0).astype(np.float32)
    for _ in range(rounds):
        num = cv2.GaussianBlur(out * known[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(known, (0, 0), sigma)
        fill = num / np.maximum(den, 1e-4)[..., None]
        grow = den > 0.02
        out = np.where((known > 0)[..., None], out, np.where(grow[..., None], fill, out))
        known = np.maximum(known, grow.astype(np.float32))
    return np.clip(out, 0, 255).astype(np.uint8)
