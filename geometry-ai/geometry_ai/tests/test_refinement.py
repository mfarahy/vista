"""Weight-free tests for the candidate refinement provider abstraction.

Run:  python -m geometry_ai.tests.test_refinement
"""

from __future__ import annotations

from ..refinement import (
    AIRefinementProvider,
    NoOpRefinementProvider,
    RefinementDecision,
    build_refinement_provider,
)


def _assert(cond, msg):
    if not cond:
        raise AssertionError(msg)
    return True


def test_noop_is_default():
    provider = build_refinement_provider()
    _assert(isinstance(provider, NoOpRefinementProvider), "default provider must be noop")
    decision = provider.refine(candidate={}, candidates=[], image_bytes=None)
    _assert(decision.decision == "uncertain", "noop never fabricates a verdict")
    _assert(decision.confidence is None, "noop never fabricates confidence")
    _assert(provider.name == "noop", "noop has a stable name")


def test_ai_provider_requires_configuration():
    provider = AIRefinementProvider(url="")
    decision = provider.refine(candidate={}, candidates=[], image_bytes=None)
    _assert(decision.decision == "uncertain", "unconfigured ai provider must stay uncertain")
    _assert(provider.name == "ai", "ai provider has a stable name")


def test_refinement_decision_parsing():
    decision = RefinementDecision.from_dict(
        {"decision": "accept", "reason": "looks like a door", "confidence": 0.94}
    )
    _assert(decision.decision == "accept", "decision passed through")
    _assert(decision.reason == "looks like a door", "reason passed through")
    _assert(abs(decision.confidence - 0.94) < 1e-9, "real confidence kept")
    bogus = RefinementDecision.from_dict(
        {"decision": "banana", "reason": "", "confidence": 7.0}
    )
    _assert(bogus.decision == "uncertain", "unknown decisions degrade to uncertain")
    _assert(bogus.confidence is None, "out-of-range confidence is never fabricated")
    _assert(
        RefinementDecision.from_dict({"decision": "reject", "reason": "no"}).confidence is None,
        "missing confidence stays None",
    )


def test_noop_does_not_break_pipeline_document():
    provider = NoOpRefinementProvider()
    decision = provider.refine(
        candidate={"id": "door-0", "status": "uncertain"},
        candidates=[{"id": "door-0"}],
        image_bytes=b"png-bytes",
    )
    _assert(decision.decision == "uncertain", "image bytes do not affect noop")


def main() -> None:
    tests = [t for name, t in sorted(globals().items()) if name.startswith("test_")]
    for t in tests:
        t()
        print(f"PASS {t.__name__}")
    print(f"\n{len(tests)}/{len(tests)} refinement tests passed")


if __name__ == "__main__":
    main()