"""Deterministic conversion of a segmentation mask into geo2 canonical geometry.

This is the *documented post-processing* layer for the Phase 3 specialized
UNet candidates (CubiCasa4-class / OpenBIM4-class). It converts the model's
native output — per-pixel class masks — into the entities the canonical schema
needs. It contains **no** architectural heuristics: no fixture-specific
corrections, no manual wall/room reconstruction, no VLM assistance, no
hardcoded coordinates.

The conversion permitted here is limited to the standard raster-to-vector
steps a floor-plan segmentation model's own inference procedure requires:

- per-class polygon extraction via morphological closing + contour tracing
  (same pipeline the CubiCasa model family ships),
- wall **centerlines** from the wall mask via morphological skeletonisation
  (a wall mask is converted to the wall *line segment* the schema models),
- opening centroids + feret diameters for doors/windows,
- speckle removal below a minimum area (the model's own threshold).

Every step is general, deterministic and disclosed in
`evaluation/phase3-report.md`; nothing is hidden inside the adapter. The
budget is intentionally small — if a class is not predicted, nothing is
fabricated for it.
"""

from __future__ import annotations

import math
from typing import Callable, Optional, Sequence

import numpy as np

# Speckle threshold (in 512×512 model pixels) — same value the CubiCasa
# extractor uses: below this a polygon is model noise, not architecture.
POLY_MIN_AREA_MODEL_PX = 30.0

# Minimum connected-component size (model px²) for a *wall* component; smaller
# blobs are line noise, not structure.
WALL_COMPONENT_MIN_AREA_MODEL_PX = 60.0

# Minimum wall run length in model pixels (≈ a real ~0.5 m divider at 512 px
# for a ~10 m-wide plan; anything shorter is junction micro-branch noise).
WALL_MIN_LEN_MODEL_PX = 12.0

# Skeleton spur-pruning length (model px): dead-end branches shorter than this
# are removed before junction decomposition.
SPUR_PRUNE_LEN_MODEL_PX = 10.0

# Douglas-Peucker tolerance (model px) applied to each skeleton chain before
# it becomes wall segments: straight runs collapse to two points, corners
# (e.g. an L-shaped wall path) are preserved as a bend vertex so the wall is
# not misdrawn as a single straight chord across the corner.
WALL_CHAIN_SIMPLIFY_TOL_MODEL_PX = 2.0

# Minimum length of an individual wall segment emitted after corner-splitting.
WALL_MIN_SEGMENT_MODEL_PX = 8.0

_NEIGH8 = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


# ---------------------------------------------------------------------------
# 1. Per-class polygon extraction (contours), model's own pipeline
# ---------------------------------------------------------------------------


def mask_to_polygons(mask: np.ndarray, class_id: int, min_area: float = POLY_MIN_AREA_MODEL_PX) -> list[np.ndarray]:
    """Extract simplified outer-ring polygons for one class from a label mask.

    Returns a list of ``(N, 2)`` float point arrays in model-pixel space.
    Morphological closing (3×3) seals hairline breaks; `approxPolyDP` collapses
    pixel staircases; components below ``min_area`` are dropped as speckle.
    """
    import cv2

    binary = (mask == class_id).astype(np.uint8)
    if int(binary.sum()) == 0:
        return []
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]

    holes_by_parent: dict[int, list[int]] = {}
    for i, (_, _, _, parent) in enumerate(hierarchy):
        if parent != -1:
            holes_by_parent.setdefault(parent, []).append(i)

    polys: list[np.ndarray] = []
    for i, (_, _, _, parent) in enumerate(hierarchy):
        if parent != -1:
            continue  # hole, handled with its parent
        if cv2.contourArea(contours[i]) < min_area:
            continue
        outer = cv2.approxPolyDP(contours[i], 1.5, closed=True).reshape(-1, 2).astype(float)
        if len(outer) < 3:
            continue
        polys.append(outer)
    return polys


# ---------------------------------------------------------------------------
# 2. Wall centerlines (mask → wall line segments)
# ---------------------------------------------------------------------------


def skeletonize_binary(binary: np.ndarray) -> np.ndarray:
    """Morphological skeleton (medial axis) of a binary mask (bool output)."""
    from skimage.morphology import skeletonize

    return skeletonize((binary > 0).astype(np.uint8))


def filter_small_components(binary: np.ndarray, min_area: float = WALL_COMPONENT_MIN_AREA_MODEL_PX) -> np.ndarray:
    """Drop connected components with fewer than `min_area` pixels.

    Removes line noise / isolated specks before skeletonisation (general
    morphological cleaning, not an architectural heuristic).
    """
    from skimage import measure

    labels = measure.label(binary > 0, connectivity=2)
    if labels.max() == 0:
        return np.zeros_like(binary, dtype=bool)
    sizes = np.bincount(labels.ravel())
    keep = np.zeros_like(labels, dtype=bool)
    keep[:] = False
    for lab, size in enumerate(sizes):
        if lab == 0:
            continue
        if size >= min_area:
            keep |= labels == lab
    return keep


def _prune_spurs(skeleton: np.ndarray, min_len: float = SPUR_PRUNE_LEN_MODEL_PX) -> np.ndarray:
    """Iteratively remove skeleton branches shorter than `min_len` (model px).

    A "spur" is a dead-end chain ending in an endpoint of degree ≤ 1. Each pass
    removes every currently-short dead-end chain (its pixels are dropped), then
    re-derives adjacency so pixels exposed by removal are re-classified. This
    converges: junction-to-junction paths are never altered.
    """
    sk = np.asarray(skeleton > 0)
    ys, xs = np.nonzero(sk)
    pts = {(int(x), int(y)) for x, y in zip(xs, ys)}
    if not pts:
        return sk

    def build_adj() -> dict[tuple[int, int], list[tuple[int, int]]]:
        adj = {p: [] for p in pts}
        for p in pts:
            adj[p] = [q for q in ((p[0] + dx, p[1] + dy) for dx, dy in _NEIGH8) if q in pts]
        return adj

    while True:
        adj = build_adj()
        removed = False
        for p in list(pts):
            if len(adj[p]) > 1:  # junction: never a spur seed
                continue
            # walk the dead-end chain from p (through degree-2 pixels) until a
            # junction or another endpoint, stopping once min_len is reached.
            chain = [p]
            prev, cur = None, p
            while len(chain) - 1 < min_len:
                nxts = [q for q in adj[cur] if q != prev]
                if len(nxts) != 1:
                    break
                nxt = nxts[0]
                if len(adj[nxt]) != 2:  # reached a junction / far endpoint
                    break
                prev, cur = cur, nxt
                chain.append(cur)
            if len(chain) - 1 >= min_len:
                continue
            if len(adj[chain[-1]]) > 1:
                continue  # unexpectedly opened into a junction -> not a spur
            for q in chain:
                if q in pts:
                    pts.discard(q)
                    sk[q[1], q[0]] = False
            removed = True
        if not removed:
            break
    return sk


def extract_polylines(skeleton: np.ndarray) -> list[np.ndarray]:
    """Decompose a skeleton into polylines split at junctions/endpoints.

    Returns a list of ``(N, 2)`` float arrays in model-pixel space. Each
    polyline runs between two skeleton nodes (junction of degree != 2, or an
    endpoint). This is the standard raster-to-vector wall decomposition and is
    fully deterministic.
    """
    ys, xs = np.nonzero(skeleton)
    pts = {(int(x), int(y)) for x, y in zip(xs, ys)}
    if not pts:
        return []

    adj: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for p in pts:
        adj[p] = [(p[0] + dx, p[1] + dy) for dx, dy in _NEIGH8 if (p[0] + dx, p[1] + dy) in pts]
    deg = {p: len(adj[p]) for p in pts}

    visited: set[frozenset] = set()
    polylines: list[list[tuple[int, int]]] = []

    for p in pts:
        if deg[p] == 2:
            continue
        for q in list(adj[p]):
            edge = frozenset((p, q))
            if edge in visited:
                continue
            poly = [p]
            prev, cur = p, q
            while True:
                edge = frozenset((prev, cur))
                if edge in visited:
                    break
                visited.add(edge)
                poly.append(cur)
                if deg[cur] != 2:
                    break
                nxts = [r for r in adj[cur] if r != prev]
                if len(nxts) != 1:
                    break
                prev, cur = cur, nxts[0]
            if len(poly) >= 2:
                polylines.append(poly)

    # Isolated closed loops (all pixels degree-2): emit the ring once.
    if not polylines:
        remaining = set(pts)
        while remaining:
            start = next(iter(remaining))
            poly = [start]
            prev, cur = None, start
            while True:
                remaining.discard(cur)
                nxts = [r for r in adj[cur] if r != prev]
                if not nxts:
                    break
                prev, cur = cur, nxts[0]
                if cur == start:
                    break
                poly.append(cur)
            if len(poly) >= 3:
                polylines.append(poly)

    return [np.asarray(p, dtype=float) for p in polylines]


def _wall_thickness_map(wall_mask: np.ndarray) -> np.ndarray:
    """Per-skeleton-pixel wall thickness (2 × distance-to-background)."""
    from scipy import ndimage as ndi

    dist = ndi.distance_transform_edt((wall_mask > 0).astype(np.uint8))
    return 2.0 * dist


def walls_from_mask(
    wall_mask: np.ndarray,
    min_len: float = WALL_MIN_LEN_MODEL_PX,
) -> list[dict]:
    """Convert a wall mask into wall centerline segments.

    Returns a list of ``{"polyline": (N,2) float, "thickness": float}`` in
    model-pixel space. Pipeline: drop sub-threshold components, skeletonise,
    prune spurs, then decompose into polylines at junctions. Only
    junction-to-junction runs survive the length floor; short endpoint stubs
    are pruning noise.
    """
    walls: list[dict] = []
    binary = wall_mask > 0
    if int(binary.sum()) == 0:
        return walls
    binary = filter_small_components(binary)
    if int(binary.sum()) == 0:
        return walls

    skel = skeletonize_binary(binary)
    skel = _prune_spurs(skel)

    # classify each pixel by degree so we can tell junction runs from stubs
    ys, xs = np.nonzero(skel)
    pts = {(int(x), int(y)) for x, y in zip(xs, ys)}
    if not pts:
        return walls
    adj = {p: [q for q in ((p[0] + dx, p[1] + dy) for dx, dy in _NEIGH8) if q in pts] for p in pts}

    polylines = extract_polylines(skel)
    if not polylines:
        return walls
    thick = _wall_thickness_map(wall_mask)

    for chain in polylines:
        length = _path_length(chain)
        if length < WALL_MIN_LEN_MODEL_PX:
            continue
        # simplify each chain, keeping corner bends as vertices
        from skimage.measure import approximate_polygon

        simp = approximate_polygon(np.asarray(chain, dtype=float), WALL_CHAIN_SIMPLIFY_TOL_MODEL_PX)
        if len(simp) < 2:
            continue
        # a junction at a chain end marks it as structural; a free-floating
        # chain must clear a longer bar to count.
        junction_contact = any(
            len(adj[(int(px), int(py))]) >= 3 for px, py in chain
        )
        for k in range(len(simp) - 1):
            a, b = simp[k], simp[k + 1]
            seg_len = float(np.hypot(b[0] - a[0], b[1] - a[1]))
            if seg_len < WALL_MIN_SEGMENT_MODEL_PX:
                continue
            if not junction_contact and seg_len < WALL_MIN_LEN_MODEL_PX * 2:
                continue
            # thickness sampled along the sub-segment
            t = _mean_thickness(thick, sample_on_segment(a, b, 5))
            if t < 0.5:
                t = 0.5
            walls.append({"polyline": np.vstack([a, b]), "thickness": t})
    return walls


def sample_on_segment(a: np.ndarray, b: np.ndarray, n: int) -> np.ndarray:
    """Interpolate ``n`` equally spaced points along segment a→b (inclusive)."""
    if n < 2:
        return np.vstack([a, b])
    t = np.linspace(0.0, 1.0, n)[:, None]
    return a + t * (b - a)


def _mean_thickness(thick: np.ndarray, poly: np.ndarray) -> float:
    ys = np.minimum(np.maximum(poly[:, 1].astype(int), 0), thick.shape[0] - 1)
    xs = np.minimum(np.maximum(poly[:, 0].astype(int), 0), thick.shape[1] - 1)
    if len(ys) == 0:
        return 0.0
    return float(np.mean(thick[ys, xs]))


def _path_length(poly: np.ndarray) -> float:
    if len(poly) < 2:
        return 0.0
    d = np.diff(poly, axis=0)
    return float(np.sum(np.hypot(d[:, 0], d[:, 1])))


def polyline_ends(poly: np.ndarray, shrink: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Return (start, end) of a polyline, optionally inset by ``shrink`` px."""
    if shrink <= 0 or len(poly) < 2:
        return poly[0].copy(), poly[-1].copy()
    d = poly[-1] - poly[0]
    length = float(np.hypot(d[0], d[1]))
    if length <= 0:
        return poly[0].copy(), poly[-1].copy()
    u = d / length
    return poly[0] + u * shrink, poly[-1] - u * shrink


# ---------------------------------------------------------------------------
# 3. Openings (doors / windows) from their masks
# ---------------------------------------------------------------------------


def _polygon_centroid(poly: np.ndarray) -> tuple[float, float]:
    n = len(poly)
    if n == 0:
        return (0.0, 0.0)
    return (float(poly[:, 0].mean()), float(poly[:, 1].mean()))


def _feret_diameter(poly: np.ndarray) -> float:
    """Maximum pairwise distance across simplified polygon vertices (feret)."""
    if len(poly) < 2:
        return 0.0
    best = 0.0
    pts = poly
    for i in range(len(pts)):
        d = pts[i] - pts
        cand = float(np.max(np.hypot(d[:, 0], d[:, 1])))
        if cand > best:
            best = cand
    if best == 0.0 and np.any(poly):
        best = float(np.max(np.hypot(pts[:, 0], pts[:, 1])))
    return best


def openings_from_mask(
    mask: np.ndarray,
    class_id: int,
    min_area: float = POLY_MIN_AREA_MODEL_PX,
    max_area: Optional[float] = None,
) -> list[dict]:
    """Extract door/window candidates from a class mask.

    Returns a list of ``{"centroid": (x, y), "width": float, "area": float,
    "polygon": (N,2)}`` in model-pixel space. `max_area` (model px²) drops
    openings that are implausibly large for the class (the class firing on a
    whole region); a sane default is applied by the caller.
    """
    polys = mask_to_polygons(mask, class_id, min_area=min_area)
    out: list[dict] = []
    for poly in polys:
        import cv2

        area = float(cv2.contourArea(poly.astype(np.float32)))
        if max_area is not None and area > max_area:
            continue
        cx, cy = _polygon_centroid(poly)
        out.append(
            {
                "centroid": (cx, cy),
                "width": _feret_diameter(poly),
                "area": area,
                "polygon": poly,
            }
        )
    return out


# ---------------------------------------------------------------------------
# 4. Association of openings to walls + assembly helpers
# ---------------------------------------------------------------------------


def nearest_wall_segment(
    point: tuple[float, float],
    wall_segments: Sequence[tuple[np.ndarray, np.ndarray]],
) -> tuple[int, float]:
    """Index + distance of the wall segment nearest to `point` (model px)."""
    best_i, best_d = -1, float("inf")
    px, py = point
    for i, (a, b) in enumerate(wall_segments):
        d = _point_segment_dist(px, py, a, b)
        if d < best_d:
            best_d, best_i = d, i
    return best_i, best_d


def _point_segment_dist(px: float, py: float, a: np.ndarray, b: np.ndarray) -> float:
    ax, ay = float(a[0]), float(a[1])
    bx, by = float(b[0]), float(b[1])
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 <= 1e-9:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def to_source_transform(
    rect: Optional[tuple[int, int, int, int]],
    scale: float,
    stretch: Optional[tuple[float, float]] = None,
) -> Callable[[float, float], tuple[float, float]]:
    """Build the model-px → source-px coordinate mapping.

    For the letterboxed model: ``rect=(left, top, iw, ih)`` + ``scale``
    (source→model). For the stretched model: ``stretch=(sx, sy)`` (model→source
    scale factors).
    """
    if stretch is not None:
        sx, sy = stretch

        def _to_s(x: float, y: float) -> tuple[float, float]:
            return (float(x) * sx, float(y) * sy)

        return _to_s
    left, top, _, _ = rect
    inv = 1.0 / scale if scale > 0 else 1.0

    def _to_l(x: float, y: float) -> tuple[float, float]:
        return ((float(x) - left) * inv, (float(y) - top) * inv)

    return _to_l