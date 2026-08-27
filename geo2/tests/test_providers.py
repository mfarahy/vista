"""Provider interface + registry + baseline provider tests."""

from __future__ import annotations

import pytest

from geometry_ai.providers import (
    available_providers,
    get_provider,
    provider_licensing,
    register_provider,
)
from geometry_ai.providers.base import FloorPlanProvider, Licensing
from geometry_ai.providers.baseline import BaselineProvider
from geometry_ai.schema import FloorPlanGeometry


def test_baseline_registered():
    assert "baseline-mock" in available_providers()
    assert get_provider("baseline-mock").id == "baseline-mock"


def test_unknown_provider_raises():
    with pytest.raises(KeyError):
        get_provider("does-not-exist")


def test_provider_is_floorplanprovider():
    assert isinstance(get_provider("baseline-mock"), FloorPlanProvider)


def test_abstract_provider_cannot_instantiate():
    with pytest.raises(TypeError):
        FloorPlanProvider()


def test_baseline_returns_schema_and_valid(tiny_image):
    p = BaselineProvider()
    geo = p.analyze(tiny_image)
    assert isinstance(geo, FloorPlanGeometry)
    assert (geo.source.width, geo.source.height) == (160, 120)


def test_baseline_references_are_consistent(tiny_image):
    p = BaselineProvider()
    geo = p.analyze(tiny_image)
    wall_ids = {w.id for w in geo.walls}
    assert geo.doors[0].wall_id in wall_ids
    assert geo.windows[0].wall_id in wall_ids
    assert len(geo.rooms) == 2
    assert all(len(r.polygon) >= 4 for r in geo.rooms)


def test_baseline_deterministic(tiny_image):
    a = BaselineProvider().analyze(tiny_image)
    b = BaselineProvider().analyze(tiny_image)
    assert a.model_dump() == b.model_dump()


def test_baseline_scales_with_image_size():
    import numpy as np

    small = np.zeros((60, 80, 3), dtype=np.uint8)
    big = np.zeros((120, 160, 3), dtype=np.uint8)
    g1 = BaselineProvider().analyze(small)
    g2 = BaselineProvider().analyze(big)
    assert g1.source.width == 80 and g2.source.width == 160
    assert g1.walls[0].start.x < g2.walls[0].start.x


def test_licensing_record():
    lic = provider_licensing("baseline-mock")
    assert lic.commercial_use == "permitted"
    assert lic.name == "baseline-mock"
    assert lic.license.startswith("MIT")
    assert lic.weights_license == "n/a (no external weights)"


def test_register_duplicate_raises():
    class Dup(BaselineProvider):
        pass

    with pytest.raises(ValueError):
        register_provider(BaselineProvider)  # already registered