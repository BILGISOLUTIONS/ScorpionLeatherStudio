#!/usr/bin/env python3
"""Pure planning policy for SLS raw reconstruction preparation."""

from __future__ import annotations

import argparse
import math
import statistics


def _positive_triplet(values, label):
    if len(values) != 3:
        raise ValueError(f"{label} must contain exactly three values.")
    result = tuple(float(value) for value in values)
    if not all(math.isfinite(value) and value > 0 for value in result):
        raise ValueError(f"{label} must contain finite positive values.")
    return result


def plan_uniform_scale(current_dimensions, target_dimensions, tolerance_ratio):
    current = _positive_triplet(current_dimensions, "current_dimensions")
    target = _positive_triplet(target_dimensions, "target_dimensions")
    tolerance = float(tolerance_ratio)
    if not math.isfinite(tolerance) or tolerance < 0:
        raise ValueError("tolerance_ratio must be finite and non-negative.")

    ratios = tuple(target[index] / current[index] for index in range(3))
    scale = statistics.median(ratios)
    scaled = tuple(value * scale for value in current)
    deviations = tuple(abs(scaled[index] - target[index]) / target[index] for index in range(3))

    return {
        "scale": scale,
        "ratios": ratios,
        "scaledDimensions": scaled,
        "deviations": deviations,
        "maxDeviation": max(deviations),
        "withinTolerance": max(deviations) <= tolerance,
    }


def plan_decimation(triangle_counts, target_triangles, minimum_safe_ratio=0.08):
    counts = tuple(max(0, int(value)) for value in triangle_counts)
    total = sum(counts)
    target = int(target_triangles)
    if target <= 0:
        raise ValueError("target_triangles must be positive.")
    if total <= target or total == 0:
        return {
            "triangleCount": total,
            "targetTriangles": target,
            "ratio": 1.0,
            "applyAutomatically": False,
            "extremeReduction": False,
        }

    ratio = target / total
    return {
        "triangleCount": total,
        "targetTriangles": target,
        "ratio": ratio,
        "applyAutomatically": ratio >= minimum_safe_ratio,
        "extremeReduction": ratio < minimum_safe_ratio,
    }


def _self_test():
    plan = plan_uniform_scale((1, 2, 3), (2, 4, 6), 0.08)
    assert abs(plan["scale"] - 2) < 1e-9
    assert plan["withinTolerance"] is True

    mismatch = plan_uniform_scale((1, 1, 1), (1, 2, 1), 0.08)
    assert mismatch["withinTolerance"] is False
    assert mismatch["maxDeviation"] >= 0.5

    modest = plan_decimation((100000, 100000, 100000), 150000)
    assert abs(modest["ratio"] - 0.5) < 1e-9
    assert modest["applyAutomatically"] is True

    extreme = plan_decimation((3200000,), 150000)
    assert extreme["extremeReduction"] is True
    assert extreme["applyAutomatically"] is False

    noop = plan_decimation((50000, 50000), 150000)
    assert noop["ratio"] == 1.0
    assert noop["applyAutomatically"] is False

    print("SLS reconstruction preparation policy self-test passed.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        _self_test()
        return
    parser.error("Use --self-test when running this policy module directly.")


if __name__ == "__main__":
    main()
