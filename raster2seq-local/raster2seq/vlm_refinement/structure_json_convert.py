"""Convert COCO-style floorplan JSON to structured JSON format.

Usage:
    python vlm_refinement/structure_json_convert.py \
        --input pred_outputs/s3d_test_preds/checkpoints/jsons/03315.json \
        --output /tmp/03315_structured.json \
        --dataset s3d
"""

import argparse
import json
import os
from pathlib import Path

from shapely.geometry import Polygon as ShapelyPolygon
from visualize_floorplan import build_color_lookup

# Label mappings from util/plot_utils.py (inlined to avoid cv2 dependency)
S3D_LABEL = {
    0: "Living Room",
    1: "Kitchen",
    2: "Bedroom",
    3: "Bathroom",
    4: "Balcony",
    5: "Corridor",
    6: "Dining room",
    7: "Study",
    8: "Studio",
    9: "Store room",
    10: "Garden",
    11: "Laundry room",
    12: "Office",
    13: "Basement",
    14: "Garage",
    15: "Misc.",
    16: "Door",
    17: "Window",
}

CC5K_LABEL = {
    0: "Outdoor",
    1: "Kitchen",
    2: "Living Room",
    3: "Bed Room",
    4: "Bath",
    5: "Entry",
    6: "Storage",
    7: "Garage",
    8: "Undefined",
    9: "Window",
    10: "Door",
}

R2G_LABEL = {
    0: "unknown",
    1: "living_room",
    2: "kitchen",
    3: "bedroom",
    4: "bathroom",
    5: "restroom",
    6: "balcony",
    7: "closet",
    8: "corridor",
    9: "washing_room",
    10: "PS",
    11: "outside",
}

LABEL_MAPS = {
    "s3d": S3D_LABEL,
    "cc5k": CC5K_LABEL,
    "r2g": R2G_LABEL,
}

# Category IDs that are not rooms (doors, windows)
NON_ROOM_CATEGORIES = {
    "s3d": {16, 17},  # Door, Window
    "cc5k": {9, 10},  # Window, Door
    "r2g": set(),
}


def remove_collinear_points(points):
    """Remove collinear points from a polygon vertex list.

    Args:
        points: list of [x, y] pairs
    Returns:
        cleaned list of [x, y] pairs
    """
    if len(points) < 3:
        return points

    def collinear(p1, p2, p3):
        return (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]) == 0

    cleaned = [points[0]]
    for i in range(1, len(points) - 1):
        if not collinear(points[i - 1], points[i], points[i + 1]):
            cleaned.append(points[i])
    cleaned.append(points[-1])
    return cleaned


def get_unique_points(segmentation):
    """Return deduplicated points from segmentation."""
    seen = set()
    unique = []
    for pt in segmentation:
        key = (pt[0], pt[1])
        if key not in seen:
            seen.add(key)
            unique.append(pt)
    return unique


def line_to_rectangle(p1, p2, thickness=4.0):
    """Expand a 2-point line segment into a thin rectangle.

    Args:
        p1, p2: [x, y] endpoints of the line
        thickness: half-width of the resulting rectangle perpendicular to the line
    Returns:
        list of 4 [x, y] points forming a rectangle
    """
    import math

    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return [p1, p1, p1, p1]
    # Unit normal perpendicular to the line
    nx = -dy / length * thickness
    ny = dx / length * thickness
    return [
        [p1[0] + nx, p1[1] + ny],
        [p2[0] + nx, p2[1] + ny],
        [p2[0] - nx, p2[1] - ny],
        [p1[0] - nx, p1[1] - ny],
    ]


def convert(input_path, output_path, dataset, add_color_cues=False, keep_wd=False, no_sem=False):
    label_map = LABEL_MAPS[dataset]
    non_room_ids = NON_ROOM_CATEGORIES[dataset]

    with open(input_path) as f:
        coco_data = json.load(f)

    # Filter: keep only room instances (by category and by geometry)
    room_instances = []
    for inst in coco_data:
        is_wd = inst["category_id"] in non_room_ids
        if is_wd and not keep_wd:
            continue
        unique_pts = get_unique_points(inst["segmentation"])
        # Window/door may only have 2 points (a line); expand to rectangle
        if is_wd and len(unique_pts) == 2:
            inst["segmentation"] = line_to_rectangle(unique_pts[0], unique_pts[1])
        elif len(unique_pts) < 3:
            continue
        room_instances.append(inst)

    # Build spaces
    type_counters = {}
    spaces = []
    shapely_polys = []

    for inst_id, inst in enumerate(room_instances):
        cat_id = inst["category_id"]
        room_type = label_map.get(cat_id, f"unknown_{cat_id}")

        # Assign id with per-type counter
        # count = type_counters.get(room_type, 0)
        type_counters[room_type] = inst_id  # count + 1
        space_id = f"{inst_id}" if no_sem else f"{room_type}|{inst_id}"

        # Clean polygon
        cleaned_pts = inst["segmentation"]  # remove_collinear_points(inst["segmentation"])
        unique_cleaned = get_unique_points(cleaned_pts)

        # Build shapely polygon from cleaned points
        shapely_poly = ShapelyPolygon([(p[0], p[1]) for p in unique_cleaned])
        shapely_polys.append(shapely_poly)

        # Floor polygon as list of dicts
        floor_polygon = [{"x": round(p[0], 1), "y": round(p[1], 1)} for p in unique_cleaned]

        space = {
            "id": space_id,
            "floor_polygon": floor_polygon,
        }
        if not no_sem:
            space["room_type"] = room_type

        # Regular (rectangular) vs irregular
        if len(unique_cleaned) == 4:
            xs = [p[0] for p in unique_cleaned]
            ys = [p[1] for p in unique_cleaned]
            space["width"] = round(max(xs) - min(xs), 1)
            space["height"] = round(max(ys) - min(ys), 1)
        else:
            space["area"] = round(shapely_poly.area, 1)

        spaces.append(space)

    # Compute adjacency graph (polygon edge proximity)
    adjacency_threshold = 8.0
    for i, space in enumerate(spaces):
        neighbors = []
        for j, other in enumerate(spaces):
            if i == j:
                continue
            dist = shapely_polys[i].boundary.distance(shapely_polys[j].boundary)
            print(dist)
            if dist < adjacency_threshold:
                neighbors.append(other["id"])
        space["graph"] = neighbors

    # Compute total_area using shapely for all polygons
    total_area = round(sum(p.area for p in shapely_polys), 1)

    output = {
        "room_count": len(spaces),
        "total_area": total_area,
        "spaces": spaces,
    }
    if add_color_cues:
        output["colors"] = build_color_lookup(dataset)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Converted {len(spaces)} rooms -> {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert COCO floorplan JSON to structured format")
    parser.add_argument("--input", required=True, help="Path to COCO-style JSON file")
    parser.add_argument("--output", required=True, help="Path for structured JSON output")
    parser.add_argument(
        "--dataset", required=True, choices=["s3d", "cc5k", "r2g"], help="Dataset label mapping to use"
    )
    parser.add_argument(
        "--add_color_cues", action="store_true", help="add a color lookup table into json object for semantic labels"
    )
    parser.add_argument(
        "--keep_wd", action="store_true", help="Keep window and door instances (expanded to thin rectangles)"
    )
    parser.add_argument(
        "--no_sem",
        action="store_true",
        help="Disable saving room_type in JSON objects; use plain instance ID for space_id",
    )
    parser.add_argument(
        "--subset_file",
        default=None,
        help="Path to a text file with one ID per line to filter inputs (only used when --input is a directory)",
    )

    args = parser.parse_args()
    if Path(args.input).is_dir():
        # assert Path(args.output).is_dir()
        subset_ids = None
        if args.subset_file:
            with open(args.subset_file) as f:
                subset_ids = {line.strip() for line in f if line.strip()}
        input_files = sorted(Path(args.input).rglob("*.json"))
        for inp_file in input_files:
            if subset_ids is not None and inp_file.stem not in subset_ids:
                continue
            output_file = Path(args.output) / inp_file.name
            convert(inp_file, output_file, args.dataset, args.add_color_cues, args.keep_wd, args.no_sem)
    else:
        convert(args.input, args.output, args.dataset, args.add_color_cues, args.keep_wd, args.no_sem)


if __name__ == "__main__":
    main()
