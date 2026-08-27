"""Offline tests for the Phase 3 specialized floor-plan providers.

These tests NEVER load weights, NEVER call a model and NEVER touch the network:
they cover provider registration, the licensing records, and the pure-geometry
raster-to-vector helpers that do not need cv2/skimage. The cv2/skimage-backed
conversion is exercised with `pytest.importorskip` so a machine without the
heavy stack still passes everything else.
"""

from __future__ import annotations

import numpy as np
import pytest

from geometry_ai.providers import available_providers, get_provider, provider_licensing
from geometry_ai.providers.base import FloorPlanProvider
from geometry_ai.providers.specialized import (
    model_io as mio,
    vectorize as vec,
)


def test_specialized_providers_registered():
    for pid in ("cubicasa-unet", "openbim-unet"):
        assert pid in available_providers()
        assert isinstance(get_provider(pid), FloorPlanProvider)


def test_specialized_provider_ids_and_arch():
    from geometry_ai.providers.specialized.cubicasa_unet import CubiCasaUNetProvider
    from geometry_ai.providers.specialized.openbim_unet import OpenBIMUNetProvider

    c = CubiCasaUNetProvider()
    o = OpenBIMUNetProvider()
    assert c.id == "cubicasa-unet"
    assert c.class_names == ("floor", "wall", "door", "window")
    assert c.wall_class == 1 and c.door_class == 2 and c.window_class == 3
    assert o.class_names == ("background", "wall", "window", "door")
    assert o.wall_class == 1 and o.window_class == 2 and o.door_class == 3
    assert c.preprocessing == "letterbox" and o.preprocessing == "stretch"


def test_specialized_licensing_records():
    lic = provider_licensing("cubicasa-unet")
    assert lic.commercial_use == "restricted"
    assert "CubiCasa5K" in lic.weights_license
    assert lic.inference_requirements.startswith("CPU")
    lic2 = provider_licensing("openbim-unet")
    assert lic2.commercial_use == "restricted"


def test_weights_dir_under_geo2():
    d = mio.weights_dir()
    assert str(d).endswith("weights")


# -- pure geometry helpers (numpy only) -----------------------------------


def test_to_source_transform_letterbox():
    # 1000×760 image, scale = min(512/1000, 512/760) = 0.512 →
    # inner = 512×389, centred: rect = (left=0, top=61, 512, 389).
    f = vec.to_source_transform((0, 61, 512, 389), 0.512)
    x, y = f(512, 61)
    assert x == pytest.approx(1000.0, rel=1e-3)
    assert y == pytest.approx(0.0, abs=1e-3)
    x1, y1 = f(0, 450)  # top + 760 * 0.512
    assert y1 == pytest.approx(760.0, rel=1e-3)
    assert x1 == pytest.approx(0.0, abs=1e-3)


def test_to_source_transform_stretch():
    f = vec.to_source_transform(None, 1.0, stretch=(2.0, 1.5))
    assert f(100, 100) == (200.0, 150.0)


def test_polyline_ends_shrink():
    poly = np.array([[0.0, 0.0], [100.0, 0.0]])
    a, b = vec.polyline_ends(poly, shrink=10.0)
    assert a.tolist() == pytest.approx([10.0, 0.0])
    assert b.tolist() == pytest.approx([90.0, 0.0])


def test_path_length_and_sample_per_segment():
    poly = np.array([[0.0, 0.0], [3.0, 4.0]])
    assert vec._path_length(poly) == pytest.approx(5.0)
    s = vec.sample_on_segment(np.array([0.0, 0.0]), np.array([10.0, 0.0]), 5)
    assert len(s) == 5
    assert s[2].tolist() == pytest.approx([5.0, 0.0])


def test_nearest_wall_segment():
    segs = [np.array([0.0, 0.0]), np.array([100.0, 0.0])]
    segs2 = [np.array([0.0, 0.0]), np.array([100.0, 0.0])]
    idx, dist = vec.nearest_wall_segment((10.0, 3.0), [(segs[0], segs[1]), (segs2[0], segs2[1])])
    assert idx == 0 and dist == pytest.approx(3.0)


def test_feret_diameter_square():
    poly = np.array([[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]])
    assert vec._feret_diameter(poly) == pytest.approx(np.hypot(10, 10))


# -- cv2/skimage-backed conversion (skipped if not installed) --------------


def test_mask_to_polygons_with_synthetic_rect():
    cv2 = pytest.importorskip("cv2")
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[10:20, 10:30] = 1
    polys = vec.mask_to_polygons(mask, 1, min_area=20.0)
    assert len(polys) == 1
    assert len(polys[0]) >= 3


def test_walls_from_synthetic_straight_wall():
    pytest.importorskip("skimage")
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[30:33, 8:58] = 1  # ~50px horizontal wall, 3 px thick
    walls = vec.walls_from_mask(mask, min_len=8.0)
    assert len(walls) == 1
    a = walls[0]["polyline"][0]
    b = walls[0]["polyline"][-1]
    assert abs(np.hypot(b[0] - a[0], b[1] - a[1])) > 30
    assert walls[0]["thickness"] > 1.0


def test_openings_from_synthetic_window():
    cv2 = pytest.importorskip("cv2")
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[20:24, 25:40] = 3  # rectangle window
    cands = vec.openings_from_mask(mask, 3)
    assert len(cands) == 1
    c = cands[0]
    assert c["centroid"] == pytest.approx((32.5, 22.0), abs=2.0)
    assert c["width"] >= 12