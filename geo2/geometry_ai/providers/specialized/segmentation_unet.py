"""Base class for geo2's Phase 3 specialized floor-plan segmentation providers.

A `SpecializedUNetProvider` runs a pretrained pixel-segmentation model (an
`segmentation_models_pytorch.UNet`) on a floor-plan image and converts the
resulting class mask into the geo2 canonical `FloorPlanGeometry` via the
documented raster-to-vector conversion in `.vectorize`.

Representation honesty (see phase3-report.md "native vs canonical"):
- The model natively produces per-pixel class masks (wall / door / window
  [+ floor or background]).
- Walls are emitted as *centerline segments derived from the wall mask*.
- Doors/windows are emitted from their masks (centroid + feret width) and
  associated to the nearest emitted wall.
- Room *instances* are NOT produced by these models (a single floor class is
  not a room decomposition) — nothing is fabricated for rooms.
- Stairs/labels/dimensions/scale are unsupported and left empty.

The weight/checkpoint loading is cached per provider id so the benchmark
runner (which builds one provider object per fixture) does not reload weights
per image.
"""

from __future__ import annotations

import base64
import io
import time
from typing import Optional

import numpy as np
from PIL import Image

from ...schema import Door, FloorPlanGeometry, Point, Source, Wall, Window
from ..base import FloorPlanProvider, Licensing, UsageInfo
from . import model_io as mio
from . import vectorize as vec

# An opening whose area (in 512×512 model px) exceeds this is a class firing
# on a whole region (e.g. a wall mis-read as an opening), not a door/window.
# (~4% of the 512² model canvas.)
MAX_OPENING_AREA_MODEL_PX = 0.04 * mio.MODEL_IMAGE_SIZE * mio.MODEL_IMAGE_SIZE

# Minimum opening width after mapping to source px (below this = speckle).
MIN_OPENING_WIDTH_SOURCE_PX = 1.0


class SpecializedUNetProvider(FloorPlanProvider):
    """Shared implementation for the two Phase 3 4-class UNet providers.

    Subclasses set `id`, `class_names`, `door_class`/`window_class`,
    `preprocessing`, weights, and license constants.
    """

    #: preprocessing style: "letterbox" (aspect-preserving) or "stretch"
    preprocessing: str = "letterbox"
    #: class-id → semantic name in class-id order (len == num_classes)
    class_names: tuple[str, ...] = ()
    wall_class: int = 1
    door_class: Optional[int] = 2
    window_class: Optional[int] = 3
    floor_class: int = 0

    weights_filename: str = ""
    weights_url: str = ""
    weights_license_note: str = ""
    checkpoint_kind: str = "safetensors"  # or "state_dict"
    commercial_use: str = "restricted"

    _model_cache: dict[str, object] = {}

    # -- model lifecycle ---------------------------------------------------

    @classmethod
    def _model(cls):
        if cls.id not in cls._model_cache:
            cls._model_cache[cls.id] = cls._load_model()
        return cls._model_cache[cls.id]

    @classmethod
    def _load_model(cls):
        import torch

        checkpoint = mio.resolve_weights(cls.weights_filename, cls.weights_url)
        model = mio.build_cached_unet(encoder_name="resnet34", num_classes=len(cls.class_names))
        if cls.checkpoint_kind == "safetensors":
            from safetensors.torch import load_file

            state = load_file(str(checkpoint), device="cpu")
            model.load_state_dict(state)
        else:
            ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
            if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
                state = ckpt["model_state_dict"]
            else:
                state = ckpt
            model.load_state_dict(state)
        model.eval()
        return model

    # -- inference ---------------------------------------------------------

    def analyze(self, image: np.ndarray) -> FloorPlanGeometry:
        model = self._model()
        h, w = image.shape[0], image.shape[1]

        t = time.perf_counter()
        if self.preprocessing == "letterbox":
            tensor, rect, scale = mio.preprocess_letterbox(image)
        else:
            tensor, sx, sy = mio.preprocess_stretch(image)
            rect, scale = None, 1.0

        mask, probs = self._forward(model, tensor)
        forward_ms = (time.perf_counter() - t) * 1000.0

        if rect is not None:
            cleaned = mio.morphology_closed_clean(mask, fill_value=self.floor_class, rect=rect)
            to_source = vec.to_source_transform(rect, scale)
            model_to_source_px = 1.0 / scale if scale > 0 else 1.0
            source_mask = mio.letterbox_mask_to_source(cleaned, rect, w, h)
        else:
            cleaned = mask
            to_source = vec.to_source_transform(None, 1.0, stretch=(sx, sy))
            model_to_source_px = (sx + sy) / 2.0
            source_mask = self._resize_nearest(mask, (h, w))

        native = self._build_native(cleaned, source_mask, (w, h))
        geometry = self._masks_to_geometry(
            image, cleaned, probs, to_source, model_to_source_px, native
        )
        total_ms = (time.perf_counter() - t) * 1000.0

        self.last_usage = UsageInfo(
            input_tokens=None,
            output_tokens=None,
            image_tokens=None,
            estimated_cost_usd=None,
            cost_status="n/a",
            gpu="cpu",
            vram_gb=0.0,
            inference_time_ms=round(forward_ms, 3),
            raw={
                "model": self.id,
                "architecture": f"UNet(resnet34, {len(self.class_names)} classes)",
                "latency_total_ms": round(total_ms, 3),
                "native_output": native,
            },
        )
        return geometry

    @staticmethod
    def _forward(model, tensor: np.ndarray):
        import torch

        with torch.no_grad():
            logits = model(torch.from_numpy(tensor))
            probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy().astype(np.float32)
            mask = logits.argmax(dim=1).squeeze(0).cpu().to(torch.uint8).numpy()
        return mask, probs

    @staticmethod
    def _resize_nearest(mask: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
        return np.asarray(
            Image.fromarray(mask).resize((shape[1], shape[0]), Image.NEAREST), dtype=mask.dtype
        )

    # -- mask → canonical geometry -----------------------------------------

    def _masks_to_geometry(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        probs: np.ndarray,
        to_source,
        model_to_source_px: float,
        native: dict,
    ) -> FloorPlanGeometry:
        w, h = image.shape[1], image.shape[0]
        source = Source(width=w, height=h)

        walls: list[Wall] = []
        wall_pts: list[tuple[str, np.ndarray, np.ndarray]] = []
        for i, wall_f in enumerate(vec.walls_from_mask((mask == self.wall_class))):
            poly_m = wall_f["polyline"]
            th_m = max(0.5, wall_f["thickness"])
            start_m, end_m = vec.polyline_ends(poly_m, shrink=th_m / 2.0)
            sx0, sy0 = to_source(*start_m)
            sx1, sy1 = to_source(*end_m)
            wid = f"wall-{i + 1:03d}"
            conf = self._centerline_confidence(probs, self.wall_class, poly_m)
            walls.append(
                Wall(
                    id=wid,
                    start=Point(x=sx0, y=sy0),
                    end=Point(x=sx1, y=sy1),
                    thickness=float(th_m * model_to_source_px),
                    type="unknown",
                    confidence=float(conf),
                )
            )
            wall_pts.append((wid, np.array([sx0, sy0], dtype=float), np.array([sx1, sy1], dtype=float)))

        doors = self._openings(
            mask, probs, self.door_class, "door", Door, to_source, model_to_source_px, wall_pts
        )
        windows = self._openings(
            mask, probs, self.window_class, "window", Window, to_source, model_to_source_px, wall_pts
        )

        native["walls_emitted"] = len(walls)
        native["doors_emitted"] = len(doors)
        native["windows_emitted"] = len(windows)
        native["rooms_emitted"] = 0

        geometry = FloorPlanGeometry(
            version="geo2-1.0",
            source=source,
            walls=walls,
            doors=doors,
            windows=windows,
        )
        return geometry

    @staticmethod
    def _centerline_confidence(probs: np.ndarray, class_id: int, poly_m: np.ndarray) -> float:
        if len(poly_m) == 0:
            return 0.5
        mid = (poly_m[0] + poly_m[-1]) / 2.0
        y = min(int(round(mid[1])), probs.shape[1] - 1)
        x = min(int(round(mid[0])), probs.shape[2] - 1)
        return float(min(1.0, max(0.05, probs[class_id][max(0, y), max(0, x)])))

    def _openings(
        self,
        mask,
        probs,
        class_id: Optional[int],
        prefix: str,
        cls,
        to_source,
        model_to_source_px: float,
        wall_pts: list[tuple[str, np.ndarray, np.ndarray]],
    ) -> list:
        if class_id is None:
            return []
        out = []
        candidates = vec.openings_from_mask(mask, class_id, max_area=MAX_OPENING_AREA_MODEL_PX)
        segs = [p[1:] for p in wall_pts]
        for j, cand in enumerate(candidates):
            ox, oy = to_source(*cand["centroid"])
            width = float(cand["width"] * model_to_source_px)
            if width < MIN_OPENING_WIDTH_SOURCE_PX:
                continue
            y_px = min(int(round(cand["centroid"][1])), probs.shape[1] - 1)
            x_px = min(int(round(cand["centroid"][0])), probs.shape[2] - 1)
            conf = float(min(1.0, max(0.05, probs[class_id][max(0, y_px), max(0, x_px)])))
            idx, _dist = vec.nearest_wall_segment((ox, oy), segs)
            if idx < 0:
                continue
            wid = wall_pts[idx][0]
            oid = f"{prefix}-{j + 1:03d}"
            if issubclass(cls, Door):
                out.append(
                    Door(id=oid, wall_id=wid, position=Point(x=ox, y=oy), width=width, confidence=conf)
                )
            else:
                out.append(
                    Window(id=oid, wall_id=wid, position=Point(x=ox, y=oy), width=width, confidence=conf)
                )
        return out

    # -- native output -------------------------------------------------------

    def _build_native(self, mask: np.ndarray, source_mask: np.ndarray, image_size: tuple[int, int]) -> dict:
        """Serialisable record of what the model *natively* produced."""
        polygons = {}
        classes = {self.wall_class, self.door_class, self.window_class}
        for cls in sorted(c for c in classes if c is not None):
            name = self.class_names[cls]
            polys = vec.mask_to_polygons(mask, cls)
            polygons[name] = [p.astype(float).round(2).tolist() for p in polys]

        buf = io.BytesIO()
        Image.fromarray(source_mask).save(buf, format="PNG")
        mask_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        return {
            "model": self.id,
            "class_names": list(self.class_names),
            "classes_predicted": sorted(int(v) for v in np.unique(mask).tolist()),
            "polygons_model_space": polygons,
            "mask_png_b64_source_space": mask_b64,
            "image_size_px": list(image_size),
        }

    # -- licensing -----------------------------------------------------------

    @classmethod
    def licensing(cls) -> Licensing:
        return Licensing(
            name=cls.id,
            source=cls.weights_url,
            license="MIT (code + listed weights); see geo2/LICENSING.md for dataset caveat",
            commercial_use=cls.commercial_use,
            weights_license=cls.weights_license_note,
            inference_requirements=f"CPU OK (no GPU; ~0.6 s/frame); weights: {cls.weights_filename}",
        )