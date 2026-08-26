"""Turn a floor-plan image into the "raw model output" JSON document.

Pipeline:

    1. Decode the raster, letterbox-normalize it to 512x512 (training time
       preprocessing), run the UNet, take softmax probabilities + argmax.
    2. Discard letterbox padding (predictions there are meaningless).
    3. Extract per-class polygons (outer ring + holes) for
       floor / wall / door / window using OpenCV contours.
    4. Extract individual rooms as connected components of the *floor* class
       that are fully enclosed by walls (i.e., that do not touch the plan's
       content border — the model labels the white background around the
       building as `floor` too).
    5. Derive wall centerlines from the wall mask via morphological skeleton
       + distance transform, producing straight wall segments with an
       estimated thickness (this mirrors what vector-floor-plan tools do
       with segmentation masks).

Every entity carries a *real* confidence value: the mean softmax probability
of the predicted class over the entity's pixels. No confidence is invented.

All polygon coordinates are converted from 512x512 mask space back into the
source image's pixel space, so downstream consumers can overlay them directly
on the original image.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Iterable

import cv2
import numpy as np
import torch
import yaml

from skimage.morphology import skeletonize

from .labels import CLASS_NAMES, CLASS_TO_ID, FLOOR_ID, WALL_ID
from .model import build_model, load_inference_checkpoint
from .normalize import apply_refinement, normalize_raw
from .preprocess import (
    ContentRect,
    load_source_rgb,
    mask_to_source_points,
    to_input_tensor,
)
from .refinement import GeometryRefinementProvider, build_refinement_provider

MODEL_ID = "cubicasa5k-unet-resnet34"
WEIGHTS_SOURCE = "https://huggingface.co/Yytsi/floorplan-to-3d-walls"
WEIGHTS_LICENSE = "MIT"
RAW_SCHEMA = "vista-geometry-ai-raw-v1"
DOC_SCHEMA = "vista-geometry-ai-v2"

# Polygon extraction tuning (aligned with the source project defaults).
CLOSING_KERNEL_PX = 3
APPROX_EPSILON_PX = 1.5
MIN_POLYGON_AREA_PX = 30.0
MIN_ROOM_AREA_PX = 250.0
MIN_WALL_LENGTH_MASK_PX = 12.0


def _approx(contour: np.ndarray, epsilon: float) -> list[list[float]]:
    simplified = cv2.approxPolyDP(contour, epsilon, closed=True)
    return simplified.reshape(-1, 2).astype(float).tolist()


def _polygons_for_class(
    mask: np.ndarray,
    class_id: int,
    content_rect: ContentRect,
    src_size: tuple[int, int],
    probs: np.ndarray,
) -> list[dict[str, Any]]:
    """Extract (outer + holes) polygons for one class and map them to source px."""
    binary = (mask == class_id).astype(np.uint8)
    if binary.sum() == 0:
        return []

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (CLOSING_KERNEL_PX,) * 2)
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, hierarchy = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]

    holes_by_parent: dict[int, list[int]] = {}
    for i, (_, _, _, parent) in enumerate(hierarchy):
        if parent != -1:
            holes_by_parent.setdefault(parent, []).append(i)

    result: list[dict[str, Any]] = []
    for i, (_, _, _, parent) in enumerate(hierarchy):
        if parent != -1:
            continue
        if cv2.contourArea(contours[i]) < MIN_POLYGON_AREA_PX:
            continue
        outer = _approx(contours[i], APPROX_EPSILON_PX)
        if len(outer) < 3:
            continue

        hole_masks: list[np.ndarray] = []
        holes: list[list[list[float]]] = []
        for j in holes_by_parent.get(i, []):
            if cv2.contourArea(contours[j]) < MIN_POLYGON_AREA_PX:
                continue
            ring = _approx(contours[j], APPROX_EPSILON_PX)
            if len(ring) >= 3:
                holes.append(ring)
                hole_masks.append(np.round(np.array(ring)).astype(np.int32))

        result.append(
            {
                "outer": mask_to_source_points(np.array(outer), content_rect, src_size),
                "holes": [
                    mask_to_source_points(np.array(h), content_rect, src_size) for h in holes
                ],
                "confidence": _polygon_confidence(probs, class_id, outer, hole_masks),
                "area_mask_px": int(cv2.contourArea(contours[i])),
            }
        )
    return result


def _polygon_confidence(
    probs: np.ndarray,
    class_id: int,
    outer: list[list[float]],
    hole_masks: list[np.ndarray],
) -> float:
    h, w = probs.shape[1:]
    filled = np.zeros((h, w), np.uint8)
    pts = np.round(np.array(outer)).astype(np.int32)
    if pts.size == 0:
        return 0.0
    cv2.fillPoly(filled, [pts], 1)
    for hole in hole_masks:
        cv2.fillPoly(filled, [hole], 0)
    ys, xs = np.nonzero(filled)
    if len(ys) == 0:
        return 0.0
    return float(probs[class_id, ys, xs].mean())


def build_outside_mask(mask: np.ndarray, content_rect: ContentRect) -> np.ndarray:
    """Mark the region outside the building envelope.

    The model paints the whole background as `floor`, so "outside" cannot be
    told apart from room interiors by class alone. Instead we flood-fill from
    the plan's content border through floor pixels: whatever is reachable from
    the edge without crossing a wall/door/window is the outside. Enclosed
    rooms are unreachable and become candidate room regions.
    """
    H, W = mask.shape
    left, top, inner_w, inner_h = content_rect
    img = np.where(mask == FLOOR_ID, 0, 255).astype(np.uint8)
    outside = np.zeros((H, W), np.uint8)

    xs = np.linspace(left, left + inner_w - 1, max(2, inner_w // 48)).astype(int)
    ys = np.linspace(top, top + inner_h - 1, max(2, inner_h // 48)).astype(int)
    seeds: list[tuple[int, int]] = []
    for x in xs:
        seeds.append((top, int(x)))
        seeds.append((top + inner_h - 1, int(x)))
    for y in ys:
        seeds.append((int(y), left))
        seeds.append((int(y), left + inner_w - 1))
    # Include letterbox padding edges (they are floor after cleaning).
    for x in range(0, W, max(1, W // 64)):
        seeds.append((0, int(x)))
        seeds.append((H - 1, int(x)))
    for y in range(0, H, max(1, H // 64)):
        seeds.append((int(y), 0))
        seeds.append((int(y), W - 1))

    for sy, sx in seeds:
        if 0 <= sy < H and 0 <= sx < W and img[sy, sx] == 0:
            cv2.floodFill(img, None, (int(sx), int(sy)), 1, flags=4)
            outside[img == 1] = 1
            # Point the rest of the flood at seeds that were already filled.
    return outside


def extract_floor_regions(
    mask: np.ndarray,
    outside: np.ndarray,
    content_rect: ContentRect,
    src_size: tuple[int, int],
    probs: np.ndarray,
) -> list[dict[str, Any]]:
    """Individual rooms: floor components enclosed by walls.

    Only floor pixels that are *not* part of the flood-filled outside region
    participate, so the background margin around the building is never a room.
    """
    left, top, inner_w, inner_h = content_rect
    floor_bin = ((mask == FLOOR_ID) & (outside == 0)).astype(np.uint8)
    n_labels, labels, stats, _ = cv2.connectedComponentsWithStats(
        floor_bin, connectivity=4
    )

    def touches_content(x0: int, y0: int, w: int, h: int) -> bool:
        return (
            x0 <= left
            or y0 <= top
            or x0 + w - 1 >= left + inner_w - 1
            or y0 + h - 1 >= top + inner_h - 1
        )

    regions: list[dict[str, Any]] = []
    for lab in range(1, n_labels):
        x0, y0, w, h, area = stats[lab]
        if area < MIN_ROOM_AREA_PX:
            continue
        if touches_content(x0, y0, w, h):
            continue

        comp_mask = (labels == lab).astype(np.uint8)
        contours, hierarchy = cv2.findContours(comp_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        if hierarchy is None or len(contours) == 0:
            continue
        hierarchy = hierarchy[0]

        # Find the largest outer contour; attach immediate child holes.
        best_idx = max(
            range(len(contours)),
            key=lambda i: cv2.contourArea(contours[i]) if hierarchy[i][3] == -1 else -1,
        )
        outer = _approx(contours[best_idx], APPROX_EPSILON_PX)
        if len(outer) < 3:
            continue

        holes: list[list[list[float]]] = []
        hole_masks: list[np.ndarray] = []
        for i, (_, _, _, parent) in enumerate(hierarchy):
            if parent != best_idx:
                continue
            if cv2.contourArea(contours[i]) < MIN_POLYGON_AREA_PX:
                continue
            ring = _approx(contours[i], APPROX_EPSILON_PX)
            if len(ring) >= 3:
                holes.append(mask_to_source_points(np.array(ring), content_rect, src_size))
                hole_masks.append(np.round(np.array(ring)).astype(np.int32))

        regions.append(
            {
                "outer": mask_to_source_points(np.array(outer), content_rect, src_size),
                "holes": holes,
                "confidence": _polygon_confidence(probs, FLOOR_ID, outer, hole_masks),
                "area_mask_px": int(area),
            }
        )
    return regions


# --------------------------------------------------------------------------
# Wall centerlines via skeletonization
# --------------------------------------------------------------------------

PathPixels = list[tuple[int, int]]  # (row, col)


def _neighbors8(point: tuple[int, int]) -> Iterable[tuple[int, int]]:
    y, x = point
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            yield (y + dy, x + dx)


def _trace_edge(
    start: tuple[int, int],
    first: tuple[int, int],
    pixels: set[tuple[int, int]],
    branch_nodes: set[tuple[int, int]],
    visited: set[tuple[int, int]],
) -> list[tuple[int, int]]:
    path = [start, first]
    visited.add(first)
    cur, prev = first, start
    while True:
        nxt: tuple[int, int] | None = None
        for nb in _neighbors8(cur):
            if nb == prev or nb not in pixels:
                continue
            if nb in branch_nodes:
                path.append(nb)
                return path
            if nb not in visited:
                nxt = nb
                break
        if nxt is None:
            return path
        visited.add(nxt)
        path.append(nxt)
        prev, cur = cur, nxt


def _trace_loop(start: tuple[int, int], pixels: set[tuple[int, int]]) -> list[tuple[int, int]]:
    path = [start]
    visited = {start}
    cur = start
    while True:
        nxt = None
        for nb in _neighbors8(cur):
            if nb in pixels and nb not in visited:
                nxt = nb
                break
        if nxt is None:
            return path
        visited.add(nxt)
        path.append(nxt)
        if nxt == start or (nxt in _neighbors8(start) and len(path) > 2):
            break
        cur = nxt
    return path


def trace_skeletons(skel: np.ndarray) -> list[list[tuple[int, int]]]:
    """Convert a skeleton boolean mask into a list of ordered pixel paths."""
    ys, xs = np.nonzero(skel)
    pixels = set(zip(ys.tolist(), xs.tolist()))
    if not pixels:
        return []

    degrees: dict[tuple[int, int], int] = {}
    for p in pixels:
        degrees[p] = sum(1 for nb in _neighbors8(p) if nb in pixels)

    branch_nodes = {p for p, d in degrees.items() if d <= 1 or d >= 3}
    visited: set[tuple[int, int]] = set()
    paths: list[list[tuple[int, int]]] = []
    for node in branch_nodes:
        for nb in _neighbors8(node):
            if nb not in pixels or nb in visited or nb in branch_nodes:
                continue
            paths.append(_trace_edge(node, nb, pixels, branch_nodes, visited))

    # Closed loops (no endpoints/junctions).
    if not branch_nodes and pixels:
        start = next(iter(pixels))
        loop = _trace_loop(start, pixels)
        if len(loop) >= 3:
            paths.append(loop)
    return paths


def _segment_thickness_and_confidence(
    path: list[tuple[int, int]],
    a_idx: int,
    b_idx: int,
    dt: np.ndarray,
    probs: np.ndarray,
) -> tuple[float, float]:
    ys = np.array([p[0] for p in path[a_idx : b_idx + 1]])
    xs = np.array([p[1] for p in path[a_idx : b_idx + 1]])
    if ys.size == 0:
        return 0.0, 0.0
    thickness_mask = float(2.0 * np.median(dt[ys, xs]))
    confidence = float(probs[WALL_ID, ys, xs].mean())
    return thickness_mask, confidence


def extract_walls(
    mask: np.ndarray,
    outside: np.ndarray,
    content_rect: ContentRect,
    src_size: tuple[int, int],
    probs: np.ndarray,
) -> list[dict[str, Any]]:
    """Derive straight wall segments (centerline, thickness, type) from the mask."""
    wall_mask = (mask == WALL_ID).astype(np.uint8)
    if wall_mask.sum() == 0:
        return []

    dt = cv2.distanceTransform(wall_mask, cv2.DIST_L2, 5)
    skel = skeletonize(wall_mask > 0)
    paths = trace_skeletons(skel)

    src_w, src_h = src_size
    left, top, inner_w, inner_h = content_rect
    sx = src_w / inner_w if inner_w else 0.0
    sy = src_h / inner_h if inner_h else 0.0
    scale = (sx + sy) / 2.0

    walls: list[dict[str, Any]] = []
    for path in paths:
        if len(path) < 4:
            continue
        pts = np.array(path, dtype=np.float32)  # (row, col)
        simplified = cv2.approxPolyDP(pts, APPROX_EPSILON_PX, closed=False)
        if simplified.shape[0] < 2:
            continue

        # Map each simplified vertex back to its index along the original path.
        vertex_indices: list[int] = []
        for v in simplified:
            dists = np.abs(pts - v).sum(axis=1)
            vertex_indices.append(int(dists.argmin()))
        vertex_indices = list(dict.fromkeys(vertex_indices))

        for a_idx, b_idx in zip(vertex_indices[:-1], vertex_indices[1:]):
            if b_idx - a_idx < 1:
                continue
            a = path[a_idx]
            b = path[b_idx]
            length_mask = float(np.linalg.norm(np.array(b) - np.array(a)))
            if length_mask < MIN_WALL_LENGTH_MASK_PX:
                continue

            thickness_mask, confidence = _segment_thickness_and_confidence(
                path, a_idx, b_idx, dt, probs
            )
            thickness = thickness_mask * scale
            if thickness <= 0:
                continue

            start = mask_to_source_points(np.array([a[::-1]]), content_rect, src_size)[0]
            end = mask_to_source_points(np.array([b[::-1]]), content_rect, src_size)[0]
            wtype = _wall_type(a, b, thickness_mask, mask, outside, content_rect)

            walls.append(
                {
                    "start": start,
                    "end": end,
                    "thickness": round(thickness, 2),
                    "type": wtype,
                    "confidence": round(confidence, 4),
                    "length_mask_px": round(length_mask, 1),
                }
            )
    return walls


def _wall_type(
    a: tuple[int, int],
    b: tuple[int, int],
    thickness_mask: float,
    mask: np.ndarray,
    outside: np.ndarray,
    content_rect: ContentRect,
) -> str:
    """Heuristic wall classification based on what is beyond each side.

    A wall is *exterior* when one of its perpendicular neighborhoods reaches
    the flood-filled outside region (background/margin), the letterbox
    padding, or a non-floor class. Walls surrounded by floor on both sides
    are interior.
    """
    mid = np.array([(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0])
    dy, dx = b[0] - a[0], b[1] - a[1]
    norm = np.hypot(dx, dy)
    if norm == 0:
        return "interior"
    normal = np.array([-dx, dy]) / norm  # (row, col) direction
    offset = thickness_mask / 2.0 + 3.0

    left, top, inner_w, inner_h = content_rect
    for sign in (1.0, -1.0):
        p = mid + sign * normal * offset
        row, col = int(round(p[0])), int(round(p[1]))
        if row < 0 or col < 0 or row >= mask.shape[0] or col >= mask.shape[1]:
            return "exterior"
        if col < left or col >= left + inner_w or row < top or row >= top + inner_h:
            return "exterior"
        if outside[row, col] != 0:
            return "exterior"
        if mask[row, col] not in (FLOOR_ID, WALL_ID):
            return "exterior"
    return "interior"


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------


class GeometryInference:
    """Stateful wrapper: load the model once, then infer for many images."""

    def __init__(
        self,
        weights_dir: str | Path,
        ckpt: str = "best.safetensors",
        config: str = "config.yaml",
        device: str | None = None,
        refinement_provider: GeometryRefinementProvider | None = None,
    ) -> None:
        weights_dir = Path(weights_dir)
        with (weights_dir / config).open() as f:
            cfg = yaml.safe_load(f)

        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.image_size: tuple[int, int] = tuple(cfg["data"]["image_size"])  # (H, W)
        self.letterbox: bool = cfg["data"].get("letterbox", True)
        self.normalize: bool = cfg["data"].get("normalize", True)

        self.model = build_model(encoder_name=cfg["model"]["encoder_name"]).to(device)
        self.epoch = load_inference_checkpoint(self.model, str(weights_dir / ckpt), device)
        self.model.eval()
        self.ckpt_path = str(weights_dir / ckpt)
        self.refinement_provider = refinement_provider or build_refinement_provider()

    @torch.no_grad()
    def _infer(self, image_bytes: bytes):
        """Run the model. Returns (mask, probs, content_rect, src_size, t_pre, t_infer)."""
        image = load_source_rgb(image_bytes)
        src_size = (image.size[0], image.size[1])

        input_t, content_rect = to_input_tensor(
            image, self.image_size, self.letterbox, self.normalize
        )
        t_infer0 = time.perf_counter()
        logits = self.model(input_t.to(self.device))
        t_infer1 = time.perf_counter()
        probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()  # (C, H, W)
        mask = logits.argmax(dim=1).squeeze(0).to(torch.uint8).cpu().numpy()

        # Zero out letterbox padding so extraction never sees synthetic edges.
        left, top, inner_w, inner_h = content_rect
        if (inner_h, inner_w) != mask.shape:
            cleaned = np.full_like(mask, FLOOR_ID)
            cleaned[top : top + inner_h, left : left + inner_w] = mask[
                top : top + inner_h, left : left + inner_w
            ]
            mask = cleaned
        return mask, probs, content_rect, src_size, t_infer0, t_infer1

    def predict_mask(self, image_bytes: bytes) -> np.ndarray:
        """Exposed raw mask (cleaned) for visualization/tests."""
        mask, _, _, _, _, _ = self._infer(image_bytes)
        return mask

    @torch.no_grad()
    def run(self, image_bytes: bytes) -> dict[str, Any]:
        t0 = time.perf_counter()
        mask, probs, content_rect, src_size, t_infer0, t_infer1 = self._infer(image_bytes)

        polygons = {
            name: _polygons_for_class(mask, CLASS_TO_ID[name], content_rect, src_size, probs)
            for name in CLASS_NAMES
        }
        outside = build_outside_mask(mask, content_rect)
        floor_regions = extract_floor_regions(mask, outside, content_rect, src_size, probs)
        walls = extract_walls(mask, outside, content_rect, src_size, probs)
        t_post = time.perf_counter()

        raw = {
            "schema": RAW_SCHEMA,
            "counts": {
                "floor": len(polygons["floor"]),
                "wall_polygons": len(polygons["wall"]),
                "door": len(polygons["door"]),
                "window": len(polygons["window"]),
                "rooms": len(floor_regions),
                "wall_segments": len(walls),
            },
            "polygons": polygons,
            "floor_regions": floor_regions,
            "walls": walls,
        }
        normalized = normalize_raw(
            {
                "input": {"width": src_size[0], "height": src_size[1]},
                "content_rect": list(content_rect),
                "walls": walls,
                "polygons": polygons,
                "floor_regions": floor_regions,
            }
        )
        normalized = apply_refinement(normalized, self.refinement_provider, image_bytes=image_bytes)
        normalized.setdefault(
            "refinement", {"provider": self.refinement_provider.name}
        )
        t_end = time.perf_counter()

        return {
            "schema": DOC_SCHEMA,
            "model": {
                "id": MODEL_ID,
                "artifact": WEIGHTS_SOURCE,
                "license": WEIGHTS_LICENSE,
                "epoch": self.epoch,
                "checkpoint": self.ckpt_path,
            },
            "input": {"width": src_size[0], "height": src_size[1]},
            "canvas_size": list(mask.shape[::-1]),
            "content_rect": list(content_rect),
            "classes": list(CLASS_NAMES),
            "timing_ms": {
                "preprocess": round((t_infer0 - t0) * 1000, 1),
                "inference": round((t_infer1 - t_infer0) * 1000, 1),
                "postprocess": round((t_post - t_infer1) * 1000, 1),
                "normalize": round((t_end - t_post) * 1000, 1),
                "total": round((t_end - t0) * 1000, 1),
            },
            "raw": raw,
            "normalized": normalized,
        }