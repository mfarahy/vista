"""Deterministic geometry normalization for the AI extraction output.

Phase 3: turn the *noisy but strong* wall field produced by the UNet into
clean, `VistaGeometry`-ready entities, using only small focused geometry
utilities — no generic geometry engine, no second model.

The pipeline mirrors the architecture diagram in docs/geometry-ai-evaluation.md:

    Raw AI Geometry
          ↓
    Wall Normalization        (snap endpoints, merge collinear/duplicate
                               segments, bridge door-scale gaps)
          ↓
    Topology Reconstruction   (wall centerlines → planar half-edge graph,
                               minimal faces = enclosed boundaries)
          ↓
    Room Reconstruction       (bounded faces → validated room polygons)
          ↓
    Opening Normalization     (validation + snapping of doors/windows on walls)
          ↓
    Normalized VistaGeometry  (the raw document stays untouched for debugging)

Guiding principles
------------------
* Deterministic: identical raw input ⇒ identical normalized output.
* No new AI: openings are only *sealed* or *dropped* from wall geometry, never
  hallucinated.
* Traceable: every entity keeps the AI confidence it came with; entities that
  deterministic post-processing moved or created are flagged (`snapped`,
  `derived`, `corrected`). Nothing is re-labeled as "detected by the model".
* Wall thickness is preserved and averaged (not reduced to center lines), so
  3D extrusion has material to work with later.
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Sequence

# ----------------------------------------------------------------------------
# Small linear-geometry helpers (source-pixel space).
# ----------------------------------------------------------------------------

EPS = 1e-9


def _sub(a: Sequence[float], b: Sequence[float]) -> tuple[float, float]:
    return (a[0] - b[0], a[1] - b[1])


def _cross(ax: float, ay: float, bx: float, by: float) -> float:
    return ax * by - ay * bx


def _dot(ax: float, ay: float, bx: float, by: float) -> float:
    return ax * bx + ay * by


def _norm(x: float, y: float) -> tuple[float, float]:
    l = math.hypot(x, y)
    if l < EPS:
        return (1.0, 0.0)
    return (x / l, y / l)


def _dist(a: Sequence[float], b: Sequence[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _seg_segment_dist(
    p: Sequence[float], a: Sequence[float], b: Sequence[float]
) -> tuple[float, float]:
    """Distance from point p to segment (a,b), plus the parameter t of the foot."""
    abx, aby = b[0] - a[0], b[1] - a[1]
    length_sq = abx * abx + aby * aby
    if length_sq < EPS:
        return (_dist(p, a), 0.0)
    t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / length_sq
    t = min(1.0, max(0.0, t))
    fx, fy = a[0] + t * abx, a[1] + t * aby
    return (math.hypot(p[0] - fx, p[1] - fy), t)


def _seg_intersect(
    a: Sequence[float],
    b: Sequence[float],
    c: Sequence[float],
    d: Sequence[float],
) -> tuple[float, float] | None:
    """Intersection point of segments ab and cd (with a small epsilon), or None."""
    abx, aby = b[0] - a[0], b[1] - a[1]
    cdx, cdy = d[0] - c[0], d[1] - c[1]
    denom = _cross(abx, aby, cdx, cdy)
    if abs(denom) < 1e-9:
        return None  # parallel / collinear (handled by wall merging)
    cax, cay = c[0] - a[0], c[1] - a[1]
    t = _cross(cax, cay, cdx, cdy) / denom
    u = _cross(cax, cay, abx, aby) / denom
    if t < -1e-6 or t > 1.0 + 1e-6 or u < -1e-6 or u > 1.0 + 1e-6:
        return None
    t = min(1.0, max(0.0, t))
    return (a[0] + t * abx, a[1] + t * aby)


def _polygon_area(points: Sequence[Sequence[float]]) -> float:
    area = 0.0
    n = len(points)
    for i in range(n):
        x_i, y_i = points[i]
        x_j, y_j = points[(i + 1) % n]
        area += x_i * y_j - x_j * y_i
    return area / 2.0


def _polygon_centroid(points: Sequence[Sequence[float]]) -> tuple[float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _orient(p: Sequence[float], q: Sequence[float], r: Sequence[float]) -> float:
    return _cross(q[0] - p[0], q[1] - p[1], r[0] - p[0], r[1] - p[1])


def _segments_cross(a, b, c, d) -> bool:
    """Do the open segments ab and cd properly cross?"""
    o1 = _orient(a, b, c)
    o2 = _orient(a, b, d)
    o3 = _orient(c, d, a)
    o4 = _orient(c, d, b)
    return ((o1 > EPS and o2 < -EPS) or (o1 < -EPS and o2 > EPS)) and (
        (o3 > EPS and o4 < -EPS) or (o3 < -EPS and o4 > EPS)
    )


def _clean_polygon(points: list[Sequence[float]]) -> list[Sequence[float]]:
    """Remove consecutive duplicates and collinear backtracking spikes."""
    pts = list(points)
    changed = True
    while changed:
        changed = False
        cleaned: list[Sequence[float]] = []
        for p in pts:
            if not cleaned or _dist(p, cleaned[-1]) > 1e-3:
                cleaned.append(p)
        if len(cleaned) <= 2:
            return cleaned
        out: list[Sequence[float]] = []
        for i in range(len(cleaned)):
            a = cleaned[i - 1]
            b = cleaned[i]
            c = cleaned[(i + 1) % len(cleaned)]
            ab, bc = _sub(b, a), _sub(c, b)
            if (
                abs(_cross(ab[0], ab[1], bc[0], bc[1])) < 0.5
                and _dot(ab[0], ab[1], bc[0], bc[1]) < 0
            ):
                changed = True
                continue
            out.append(b)
        pts = out
    return pts


def _polygon_is_simple(points: Sequence[Sequence[float]]) -> bool:
    n = len(points)
    if n < 3:
        return False
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        for j in range(i + 1, n):
            if abs(i - j) <= 1 or abs(i - j) == n - 1:
                continue
            c, d = points[j], points[(j + 1) % n]
            if _dist(a, c) < 1e-3 or _dist(a, d) < 1e-3 or _dist(b, c) < 1e-3 or _dist(b, d) < 1e-3:
                continue
            if _segments_cross(a, b, c, d):
                return False
    return True


def _scale_from_content(src_w: int, src_h: int, content_rect: Sequence[int]) -> float:
    _, _, inner_w, inner_h = content_rect
    sx = src_w / inner_w if inner_w else 0.0
    sy = src_h / inner_h if inner_h else 0.0
    return (sx + sy) / 2.0


def _median(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2.0


# ----------------------------------------------------------------------------
# 1. Wall normalization
# ----------------------------------------------------------------------------


def _snap_endpoints(walls: list[dict[str, Any]], snap_tol: float) -> list[dict[str, Any]]:
    """Cluster wall endpoints within `snap_tol`; each cluster becomes one vertex.

    Walls whose two endpoints collapse are dropped (zero-length artefacts).
    """
    if not walls:
        return []
    cluster_pts: list[list[tuple[float, float]]] = []
    clusters: list[int] = []
    for w in walls:
        for side in (w["start"], w["end"]):
            x, y = side
            best, best_d = -1, snap_tol
            for ci, pts in enumerate(cluster_pts):
                cx, cy = pts[0]
                d = math.hypot(x - cx, y - cy)
                if d <= snap_tol and d < best_d:
                    best, best_d = ci, d
            if best >= 0:
                clusters.append(best)
                cluster_pts[best].append((x, y))
            else:
                clusters.append(len(cluster_pts))
                cluster_pts.append([(x, y)])
    centroids = [
        (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        for pts in cluster_pts
    ]

    out: list[dict[str, Any]] = []
    for i, w in enumerate(walls):
        start = centroids[clusters[2 * i]]
        end = centroids[clusters[2 * i + 1]]
        if _dist(start, end) < 0.5:
            continue
        nw = dict(w)
        moved = (
            _dist(start, w["start"]) > 1e-3 or _dist(end, w["end"]) > 1e-3
        )
        nw["start"] = [start[0], start[1]]
        nw["end"] = [end[0], end[1]]
        nw["snapped"] = bool(w.get("snapped", False) or moved)
        out.append(nw)
    return out


def _angle_of(w: dict[str, Any]) -> float:
    return math.atan2(
        w["end"][1] - w["start"][1], w["end"][0] - w["start"][0]
    ) % math.pi


def _merge_collinear_walls(
    walls: list[dict[str, Any]],
    *,
    lateral_tol: float,
    angle_tol_deg: float,
    gap_bridge: float,
    min_keep: float,
) -> list[dict[str, Any]]:
    """Merge overlapping / near-collinear wall segments and bridge openings.

    Pass 1 clusters walls by their unoriented direction, pass 2 by lateral
    offset (two parallel but distinct walls never merge), pass 3 unions their
    spans along the shared line when they overlap or are separated by an
    opening-scale gap (a door/window slit that would otherwise merge rooms or
    leave the shell open).
    """
    if not walls:
        return []
    angle_tol = math.radians(angle_tol_deg)

    # binomial-style direction clustering respecting angular wrap-around
    def _cluster_angles(
        items: list[tuple[float, int]],
    ) -> list[list[int]]:
        items = sorted(items, key=lambda t: t[0])
        groups: list[list[int]] = []
        for theta, idx in items:
            if groups and abs(theta - groups[-1][0]) <= angle_tol + 1e-9:
                groups[-1][1].append(idx)
            else:
                groups.append((theta, [idx]))
        if len(groups) >= 2:
            # 0° ↔ π° wrap
            first = groups[0][0]
            last = groups[-1][0]
            if first < angle_tol and (math.pi - last) < angle_tol:
                groups[0] = (last, groups[-1][1] + groups[0][1])
                groups.pop()
        return [g[1] for g in groups]

    records = [dict(w) for w in walls]
    angled = [(math.atan2(r["end"][1] - r["start"][1], r["end"][0] - r["start"][0]) % math.pi, i) for i, r in enumerate(records)]
    angle_groups = _cluster_angles(angled)

    # Reference direction per angle group. Walls are *unoriented* (start/end
    # may run either way), so a direct vector sum would cancel (e.g. vertical
    # walls stored as up and down). We flip every member against the longest
    # member's orientation, then length-weight the mean.
    def _group_dir(group: list[int]) -> tuple[float, float]:
        longest_idx = max(group, key=lambda i: _dist(records[i]["start"], records[i]["end"]))
        ref = (
            records[longest_idx]["end"][0] - records[longest_idx]["start"][0],
            records[longest_idx]["end"][1] - records[longest_idx]["start"][1],
        )
        vx = vy = 0.0
        for idx in group:
            r = records[idx]
            dx = r["end"][0] - r["start"][0]
            dy = r["end"][1] - r["start"][1]
            ln = math.hypot(dx, dy)
            if ln < 1e-6:
                continue
            if dx * ref[0] + dy * ref[1] < 0:
                dx, dy = -dx, -dy
            vx += dx
            vy += dy
        return _norm(vx, vy)

    merged: list[dict[str, Any]] = []
    for group in angle_groups:
        if not group:
            continue
        u = _group_dir(group)
        # ---- pass 2: lateral offset clustering
        laterals = sorted(
            (_cross(u[0], u[1], (records[i]["start"][0] + records[i]["end"][0]) / 2,
                     (records[i]["start"][1] + records[i]["end"][1]) / 2), i)
            for i in group
        )
        lat_groups: list[list[tuple[float, int]]] = []
        for lat, idx in laterals:
            if lat_groups and abs(lat - lat_groups[-1][-1][0]) <= lateral_tol + 1e-9:
                lat_groups[-1].append((lat, idx))
            else:
                lat_groups.append([(lat, idx)])
        # ---- pass 3: union spans along the shared line
        def _merge_run(run: list[int]) -> dict[str, Any] | None:
            spans: list[tuple[float, float]] = []
            total_len = 0.0
            lat_sum = 0.0
            th_sum = 0.0
            conf_sum = 0.0
            ext_len = 0.0
            mx_acc = 0.0
            my_acc = 0.0
            for idx in run:
                r = records[idx]
                t0 = _dot(u[0], u[1], r["start"][0], r["start"][1])
                t1 = _dot(u[0], u[1], r["end"][0], r["end"][1])
                lo, hi = min(t0, t1), max(t0, t1)
                ln = max(hi - lo, 1e-6)
                spans.append((lo, hi))
                lat = _cross(u[0], u[1], (r["start"][0] + r["end"][0]) / 2,
                             (r["start"][1] + r["end"][1]) / 2)
                total_len += ln
                lat_sum += lat * ln
                th_sum += r["thickness"] * ln
                conf_sum += r["confidence"] * ln
                if r["type"] == "exterior":
                    ext_len += ln
                mx_acc += (r["start"][0] + r["end"][0]) / 2
                my_acc += (r["start"][1] + r["end"][1]) / 2
            lo = min(s[0] for s in spans)
            hi = max(s[1] for s in spans)
            mx, my = mx_acc / len(run), my_acc / len(run)
            lat = lat_sum / total_len
            lat_m = _cross(u[0], u[1], mx, my)
            n = (-u[1], u[0])
            adjust = lat - lat_m

            def line_point(t: float) -> tuple[float, float]:
                base = (mx + n[0] * adjust, my + n[1] * adjust)
                t_ref = _dot(u[0], u[1], mx, my)
                return (base[0] + u[0] * (t - t_ref), base[1] + u[1] * (t - t_ref))

            return {
                "start": [round(line_point(lo)[0], 2), round(line_point(lo)[1], 2)],
                "end": [round(line_point(hi)[0], 2), round(line_point(hi)[1], 2)],
                "thickness": round(max(0.5, th_sum / total_len), 2),
                "type": "exterior" if ext_len >= total_len / 2 else "interior",
                "confidence": round(conf_sum / total_len, 4),
                "snapped": False,
            }

        for lat_run in lat_groups:
            spans = sorted(
                (
                    _dot(u[0], u[1], records[i]["start"][0], records[i]["start"][1]),
                    _dot(u[0], u[1], records[i]["end"][0], records[i]["end"][1]),
                    i,
                )
                for i in (idx for _, idx in lat_run)
            )
            run: list[int] = []
            cur_hi: float | None = None
            for t0, t1, idx in spans:
                lo, hi = min(t0, t1), max(t0, t1)
                if cur_hi is not None and lo <= cur_hi + gap_bridge:
                    run.append(idx)
                    cur_hi = max(cur_hi, hi)
                else:
                    if run:
                        merged_wall = _merge_run(run)
                        if merged_wall:
                            merged.append(merged_wall)
                    run = [idx]
                    cur_hi = hi
            if run:
                merged_wall = _merge_run(run)
                if merged_wall:
                    merged.append(merged_wall)

    # Deterministic ordering, drop too-short leftovers.
    merged.sort(key=lambda w: (w["start"][0], w["start"][1]))
    out = []
    for w in merged:
        if _dist(w["start"], w["end"]) >= min_keep:
            out.append(w)
    return out


def normalize_walls(
    raw_walls: list[dict[str, Any]],
    src_w: int,
    src_h: int,
    scale: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Produce normalized wall segments from the raw AI centerline walls."""
    thicknesses = [w["thickness"] for w in raw_walls if w["thickness"] > 0]
    median_th = _median(thicknesses) or max(6.0, 3.0 * scale)
    min_dim = float(min(src_w, src_h))

    snap_tol = max(1.25 * median_th, 2.5 * scale)
    lateral_tol = 0.5 * median_th
    # Door-scale openings are sealed so rooms are not merged through them.
    gap_bridge = max(1.5 * median_th, 0.20 * min_dim)
    min_keep = max(2.5 * scale, 0.5 * median_th)

    walls = [dict(w) for w in raw_walls]
    for w in walls:
        w.setdefault("snapped", False)

    # 1) endpoint clustering
    walls = _snap_endpoints(walls, snap_tol)
    # 2) collinear merge + gap bridge, iterate to a fixpoint (cap passes)
    for _ in range(6):
        nxt = _merge_collinear_walls(
            walls,
            lateral_tol=lateral_tol,
            angle_tol_deg=6.0,
            gap_bridge=gap_bridge,
            min_keep=min_keep,
        )
        if len(nxt) == len(walls):
            walls = nxt
            break
        walls = nxt
    # 3) re-snap after merging; drop degenerate leftovers
    walls = _snap_endpoints(walls, snap_tol)
    walls = [w for w in walls if _dist(w["start"], w["end"]) >= min_keep]

    notes = {
        "wall_snap_tolerance_px": round(snap_tol, 2),
        "wall_lateral_tolerance_px": round(lateral_tol, 2),
        "wall_gap_bridge_px": round(gap_bridge, 2),
        "wall_min_keep_px": round(min_keep, 2),
        "median_thickness_px": round(median_th, 2),
        "walls_before": len(raw_walls),
        "walls_after": len(walls),
    }
    return walls, notes


# ----------------------------------------------------------------------------
# 2. Wall topology
# ----------------------------------------------------------------------------


class WallTopology:
    """Minimal planar graph of wall centerlines.

    Nodes are clustered split points (endpoints, T-junction projections and
    proper crossings). Edges connect consecutive nodes along a wall segment.
    Each edge remembers which wall segment(s) it came from, for traceability.
    """

    def __init__(
        self,
        walls: list[dict[str, Any]],
        snap_tol: float,
        scale: float,
        corner_tol: float,
    ) -> None:
        self.walls = walls
        self.segments: list[tuple[tuple[float, float], tuple[float, float], int]] = [
            ((w["start"][0], w["start"][1]), (w["end"][0], w["end"][1]), i)
            for i, w in enumerate(walls)
        ]
        self.snap_tol = snap_tol
        self.corner_tol = corner_tol
        self.eps = max(scale * 0.5, 0.8)
        self._collect()
        self._cluster()
        self._link_edges()
        self._close_corner_gaps()

    # -- candidate split points (each carries segment membership + t) -------
    def _collect(self) -> None:
        cand: list[list[tuple[float, float], list[tuple[int, float]]]] = []
        segs = self.segments
        for i, (a, b, _) in enumerate(segs):
            cand.append([(a[0], a[1]), [(i, 0.0)]])
            cand.append([(b[0], b[1]), [(i, 1.0)]])
        # endpoint-on-segment T-junctions
        for i, (a, b, _) in enumerate(segs):
            for j, (c, d, _) in enumerate(segs):
                if i == j:
                    continue
                for e in (c, d):
                    dist, t = _seg_segment_dist(e, a, b)
                    if dist <= self.snap_tol and 1e-4 < t < 1 - 1e-4:
                        px = a[0] + t * (b[0] - a[0])
                        py = a[1] + t * (b[1] - a[1])
                        # The projection lies on segment *i* (the host wall).
                        cand.append([(px, py), [(i, t)]])
        # proper crossings
        n = len(segs)
        for i in range(n):
            a, b, _ = segs[i]
            for j in range(i + 1, n):
                c, d, _ = segs[j]
                p = _seg_intersect(a, b, c, d)
                if p is not None:
                    abx, aby = b[0] - a[0], b[1] - a[1]
                    ti = (p[0] - a[0]) / abx if abs(abx) > 1e-9 else (p[1] - a[1]) / aby
                    cdx, cdy = d[0] - c[0], d[1] - c[1]
                    tj = (p[0] - c[0]) / cdx if abs(cdx) > 1e-9 else (p[1] - c[1]) / cdy
                    cand.append([(p[0], p[1]), [(i, ti), (j, tj)]])
        self.cand = cand

    def _cluster(self) -> None:
        pts = [c[0] for c in self.cand]
        parent = list(range(len(pts)))

        def find(k: int) -> int:
            while parent[k] != k:
                parent[k] = parent[parent[k]]
                k = parent[k]
            return k

        for i in range(len(pts)):
            xi, yi = pts[i]
            for j in range(i + 1, len(pts)):
                xj, yj = pts[j]
                if math.hypot(xi - xj, yi - yj) <= self.snap_tol:
                    ri, rj = find(i), find(j)
                    if ri != rj:
                        parent[ri] = rj

        groups: dict[int, list[int]] = {}
        for i in range(len(pts)):
            groups.setdefault(find(i), []).append(i)
        nodes: list[tuple[float, float]] = []
        node_of: list[int] = [-1] * len(pts)
        for g in groups.values():
            cx = sum(pts[k][0] for k in g) / len(g)
            cy = sum(pts[k][1] for k in g) / len(g)
            idx = len(nodes)
            nodes.append((cx, cy))
            for k in g:
                node_of[k] = idx
        self.pos = nodes
        self._node_of = node_of

    def _link_edges(self) -> None:
        segs = self.segments
        per_seg: list[list[tuple[float, int]]] = [[] for _ in segs]
        for ci, (_, memberships) in enumerate(self.cand):
            nid = self._node_of[ci]
            for seg_idx, t in memberships:
                per_seg[seg_idx].append((t, nid))

        adjacency: dict[int, set[int]] = {}
        edges: set[tuple[int, int]] = set()
        edge_walls: dict[tuple[int, int], set[int]] = {}
        pos = self.pos
        for seg_idx, lst in enumerate(per_seg):
            lst.sort(key=lambda s: s[0])
            uniq: list[tuple[float, int]] = []
            for t, nid in lst:
                if not uniq or uniq[-1][1] != nid:
                    uniq.append((t, nid))
            pairs = list(zip(uniq[:-1], uniq[1:]))
            for (_, n1), (_, n2) in pairs:
                if n1 == n2:
                    continue
                if math.hypot(pos[n1][0] - pos[n2][0], pos[n1][1] - pos[n2][1]) < 0.5:
                    continue
                key = (min(n1, n2), max(n1, n2))
                edges.add(key)
                edge_walls.setdefault(key, set()).add(seg_idx)
                adjacency.setdefault(n1, set()).add(n2)
                adjacency.setdefault(n2, set()).add(n1)
        self.adjacency = adjacency
        self.edges = list(edges)
        self.edge_walls = edge_walls

    def _close_corner_gaps(self) -> None:
        """Connect wall endpoints that nearly meet at a corner.

        When two *non-collinear* wall ends fall within `corner_tol` of each
        other (a corner the skeleton fragmented), the shell is left open and no
        face can close. We seal such gaps by adding an explicit graph edge —
        but never across collinear openings (those are handled by the merge
        stage)."""
        corner_tol = self.corner_tol
        if corner_tol <= 0:
            return
        for i in range(len(self.segments)):
            a1, b1, _ = self.segments[i]
            d1 = _norm(b1[0] - a1[0], b1[1] - a1[1])
            e1s = (a1, 2 * i, 0.0)
            e2s = (b1, 2 * i + 1, 1.0)
            for j in range(i + 1, len(self.segments)):
                a2, b2, _ = self.segments[j]
                d2 = _norm(b2[0] - a2[0], b2[1] - a2[1])
                ang = math.acos(max(-1.0, min(1.0, d1[0] * d2[0] + d1[1] * d2[1])))
                ang = min(ang, math.pi - ang)
                if ang < math.radians(30):
                    continue  # collinear-ish: not a corner
                for e1, c1, _s in (e1s, e2s):
                    for e2, c2, _t in ((a2, 2 * j, 0.0), (b2, 2 * j + 1, 1.0)):
                        if math.hypot(e1[0] - e2[0], e1[1] - e2[1]) > corner_tol:
                            continue
                        n1 = self._node_of[c1]
                        n2 = self._node_of[c2]
                        if n1 == n2:
                            continue
                        key = (min(n1, n2), max(n1, n2))
                        if key in self.edges:
                            continue
                        self.edges.append(key)
                        self.edge_walls.setdefault(key, set()).add(i)
                        self.edge_walls[key].add(j)
                        self.adjacency.setdefault(n1, set()).add(n2)
                        self.adjacency.setdefault(n2, set()).add(n1)


# ----------------------------------------------------------------------------
# 3. Face traversal → minimal closed boundaries
# ----------------------------------------------------------------------------


def _next_directed_edge(
    head: tuple[int, int], adjacency: dict[int, Iterable[int]], pos: list
) -> tuple[int, int]:
    """DCEL-style successor for traversing the face on the left of edge `head`.

    next = immediate predecessor of the twin half-edge (v→u) in counter-
    clockwise angular order at v. Falls back to the twin for dead-ends/bridges.
    """
    u, v = head
    ux, uy = pos[u]
    vx, vy = pos[v]
    twin = math.atan2(uy - vy, ux - vx)
    best_w: int | None = None
    best_delta = 2 * math.pi
    for w in adjacency.get(v, ()):
        if w == u:
            continue  # never turn straight back onto the twin edge
        wx, wy = pos[w]
        d = math.atan2(wy - vy, wx - vx)
        delta = (twin - d) % (2 * math.pi)
        if delta < best_delta - 1e-9:
            best_delta = delta
            best_w = w
    if best_w is None:
        return (v, u)  # dead end: cross the bridge back
    return (v, best_w)


def find_faces(topology: WallTopology) -> list[dict[str, Any]]:
    """Return bounded minimal faces of the wall graph as polygons."""
    adjacency = topology.adjacency
    pos = topology.pos
    directed: list[tuple[int, int]] = []
    for u in sorted(adjacency.keys()):
        for v in sorted(adjacency[u]):
            directed.append((u, v))

    used: set[tuple[int, int]] = set()
    faces: list[dict[str, Any]] = []
    for start in directed:
        if start in used:
            continue
        chain: list[tuple[int, int]] = []
        cur = start
        while cur not in used:
            chain.append(cur)
            used.add(cur)
            cur = _next_directed_edge(cur, adjacency, pos)
            if cur == start:
                break
        if len(chain) < 3:
            continue
        poly = [pos[e[0]] for e in chain]
        area = _polygon_area(poly)
        if area <= 0:
            continue  # bounded faces are positive; the unbounded face is not
        faces.append({"polygon": poly, "area": area, "chain": chain})
    return faces


# ----------------------------------------------------------------------------
# 4. Room reconstruction + validation
# ----------------------------------------------------------------------------


def reconstruct_rooms(
    topology: WallTopology,
    walls: list[dict[str, Any]],
    src_w: int,
    src_h: int,
    median_th: float,
    scale: float,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    faces = find_faces(topology)
    min_area = 0.0025 * (src_w * src_h)
    min_dim = max(1.5 * median_th, 2.0 * 2.0 * scale)
    rooms: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for f in faces:
        poly = _clean_polygon(f["polygon"])
        area = _polygon_area(poly)
        if area < min_area:
            rejected.append({"cause": "too_small", "area": round(area, 1)})
            continue
        if not _polygon_is_simple(poly):
            rejected.append({"cause": "not_simple", "area": round(area, 1)})
            continue
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        box_w = max(xs) - min(xs)
        box_h = max(ys) - min(ys)
        if min(box_w, box_h) < min_dim:
            rejected.append({"cause": "too_thin", "area": round(area, 1)})
            continue
        if min(xs) < -50 or min(ys) < -50 or max(xs) > src_w + 50 or max(ys) > src_h + 50:
            rejected.append({"cause": "out_of_bounds", "area": round(area, 1)})
            continue

        wall_ids: set[int] = set()
        confs: list[float] = []
        lengths: list[float] = []
        for u, v in f["chain"]:
            key = (min(u, v), max(u, v))
            wids = topology.edge_walls.get(key, set())
            wall_ids |= wids
            for wid in wids:
                w = walls[wid]
                lengths.append(
                    math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])
                )
                confs.append(w["confidence"])
        denom = sum(max(l, 1e-6) for l in lengths)
        room_conf = (
            sum(c * max(l, 1e-6) for c, l in zip(confs, lengths)) / denom
            if denom
            else None
        )
        rooms.append(
            {
                "polygon": [[round(px, 2), round(py, 2)] for px, py in poly],
                "area_px": round(area, 1),
                "wall_indices": sorted(wall_ids),
                "confidence": room_conf,
                "derived": True,
                "validation": {
                    "closed": True,
                    "simple": True,
                    "min_dim_px": round(min(box_w, box_h), 2),
                },
            }
        )
    rooms.sort(key=lambda r: -r["area_px"])
    return rooms, rejected


# ----------------------------------------------------------------------------
# 5. Door / window normalization
# ----------------------------------------------------------------------------


def normalize_openings(
    polys: list[dict[str, Any]],
    walls: list[dict[str, Any]],
    *,
    median_th: float,
    scale: float,
    src_w: int,
    src_h: int,
) -> tuple[list[dict[str, Any]], int]:
    """Validate AI openings against the walls; snap the slightly misaligned.

    Rejects openings that are far from any wall, not aligned with a wall, or
    of implausible size. Never invents openings: a dropped opening stays dropped
    (and is counted in `notes`).
    """
    openings: list[dict[str, Any]] = []
    rejected = 0
    for poly in polys:
        outer = [(p[0], p[1]) for p in poly["outer"]]
        if len(outer) < 3:
            rejected += 1
            continue
        cx, cy = _polygon_centroid(outer)

        best: tuple[float, float, int] | None = None
        for wi, w in enumerate(walls):
            d, t = _seg_segment_dist((cx, cy), w["start"], w["end"])
            if best is None or d < best[0]:
                best = (d, t, wi)
        if best is None:
            rejected += 1
            continue
        dist, t, wi = best
        wall = walls[wi]
        wlen = math.hypot(wall["end"][0] - wall["start"][0], wall["end"][1] - wall["start"][1])
        if wlen < 1e-6:
            rejected += 1
            continue
        u = _norm(wall["end"][0] - wall["start"][0], wall["end"][1] - wall["start"][1])
        along: list[float] = []
        perp: list[float] = []
        for x, y in outer:
            relx = x - wall["start"][0]
            rely = y - wall["start"][1]
            along.append(_dot(u[0], u[1], relx, rely))
            perp.append(_cross(u[0], u[1], relx, rely))
        along_w = max(along) - min(along)
        perp_w = max(perp) - min(perp)

        max_dist = wall["thickness"] * 1.2 + 2.0 * scale
        max_perp = max(
            wall["thickness"] * 1.7 + 2.0 * scale, median_th * 1.9 + 2.0 * scale
        )
        min_width = max(3.0, median_th * 0.35)
        max_width = wlen * 0.92

        valid = (
            dist <= max_dist
            and perp_w <= max_perp
            and min_width <= along_w <= max_width
            and along_w >= perp_w * 0.4
        )
        if not valid:
            rejected += 1
            continue

        corrected = dist > max(2.0, scale)
        openings.append(
            {
                "wall_id": str(wi),
                "position": round(t, 4),
                "width": round(max(along_w, 1.0), 2),
                "confidence": float(poly.get("confidence", 0.0)),
                "corrected": bool(corrected),
            }
        )
    return openings, rejected


# ----------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------

NORMALIZED_SCHEMA = "vista-geometry-normalized-v1"


def normalize_raw(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw model document into the normalized geometry document."""
    src_w = int(raw["input"]["width"])
    src_h = int(raw["input"]["height"])
    scale = _scale_from_content(src_w, src_h, raw["content_rect"])
    raw_walls = raw["walls"]

    walls, wall_notes = normalize_walls(raw_walls, src_w, src_h, scale)

    thicknesses = [w["thickness"] for w in walls if w["thickness"] > 0]
    median_th = _median(thicknesses) or max(6.0, 3.0 * scale)
    snap_tol = max(1.25 * median_th, 2.5 * scale)

    topology = WallTopology(walls, snap_tol, scale, corner_tol=1.75 * median_th)
    rooms, rejected_rooms = reconstruct_rooms(
        topology, walls, src_w, src_h, median_th, scale
    )
    doors, rejected_doors = normalize_openings(
        raw["polygons"]["door"],
        walls,
        median_th=median_th,
        scale=scale,
        src_w=src_w,
        src_h=src_h,
    )
    windows, rejected_windows = normalize_openings(
        raw["polygons"]["window"],
        walls,
        median_th=median_th,
        scale=scale,
        src_w=src_w,
        src_h=src_h,
    )

    wall_out = [
        {
            "id": f"n-wall-{i}",
            "start": [round(w["start"][0], 2), round(w["start"][1], 2)],
            "end": [round(w["end"][0], 2), round(w["end"][1], 2)],
            "thickness": round(w["thickness"], 2),
            "type": w["type"],
            "confidence": round(w["confidence"], 4),
            "snapped": bool(w.get("snapped", False)),
        }
        for i, w in enumerate(walls)
    ]
    room_out = [
        {
            "id": f"n-room-{i}",
            "polygon": r["polygon"],
            "area_px": r["area_px"],
            "wall_ids": [wall_out[j]["id"] for j in r["wall_indices"]],
            "confidence": round(r["confidence"], 4) if r["confidence"] is not None else None,
            "derived": True,
            "validation": r["validation"],
        }
        for i, r in enumerate(rooms)
    ]
    door_out = [{**d, "id": f"n-door-{i}"} for i, d in enumerate(doors)]
    window_out = [{**w, "id": f"n-window-{i}"} for i, w in enumerate(windows)]

    counts = {
        "walls": len(wall_out),
        "rooms": len(room_out),
        "doors": len(door_out),
        "windows": len(window_out),
    }
    notes = {
        **wall_notes,
        "rooms_raw": len(raw.get("floor_regions", [])),
        "rooms_reconstructed": len(room_out),
        "rooms_rejected": len(rejected_rooms),
        "room_rejection_causes": _count_causes(rejected_rooms),
        "openings_rejected": {"door": rejected_doors, "window": rejected_windows},
    }
    return {
        "schema": NORMALIZED_SCHEMA,
        "walls": wall_out,
        "rooms": room_out,
        "doors": door_out,
        "windows": window_out,
        "counts": counts,
        "notes": notes,
    }


def _count_causes(rejected: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for r in rejected:
        counts[r["cause"]] = counts.get(r["cause"], 0) + 1
    return counts