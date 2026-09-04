"""Convert structured JSON format back to COCO-style floorplan JSON.

Reverse of structure_json_convert.py.

Usage:
    python vlm_refinement/coco_json_convert.py \
        --input /tmp/03315_structured.json \
        --output /tmp/03315_coco.json \
        --dataset s3d
"""

import argparse
import json
import os
from pathlib import Path

from structure_json_convert import LABEL_MAPS, NON_ROOM_CATEGORIES


def build_reverse_label_map(label_map):
    """Build reverse mapping: room_type string -> category_id int."""
    return {v: k for k, v in label_map.items()}


def rectangle_to_line(points):
    """Collapse a thin rectangle back to its 2-point midline.

    Given 4 points [p0, p1, p2, p3] produced by line_to_rectangle,
    recover the original two endpoints by averaging opposite corners.
    """
    p0, p1, p2, p3 = points
    mid1 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2]
    mid2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
    return [mid1, mid2]


def convert(input_path, output_path, dataset, image_id=None, keep_wd=False, no_sem=False):
    label_map = LABEL_MAPS[dataset]
    reverse_label_map = build_reverse_label_map(label_map)
    non_room_ids = NON_ROOM_CATEGORIES[dataset]

    with open(input_path) as f:
        structured_data = json.load(f)

    if image_id is None:
        image_id = Path(input_path).stem

    coco_instances = []
    for idx, space in enumerate(structured_data["spaces"]):
        segmentation = [[p["x"], p["y"]] for p in space["floor_polygon"]]

        if no_sem:
            cat_id = 0
        else:
            cat_id = reverse_label_map.get(space["room_type"], -1)

        # Convert window/door rectangles back to 2-point lines
        if keep_wd and cat_id in non_room_ids and len(segmentation) == 4:
            segmentation = rectangle_to_line(segmentation)

        coco_instances.append(
            {
                "image_id": image_id,
                "segmentation": segmentation,
                "category_id": cat_id,
                "id": idx,
            }
        )

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(coco_instances, f, indent=2)

    print(f"Converted {len(coco_instances)} rooms -> {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert structured JSON to COCO floorplan format")
    parser.add_argument("--input", required=True, help="Path to structured JSON file or directory")
    parser.add_argument("--output", required=True, help="Path for COCO JSON output file or directory")
    parser.add_argument(
        "--dataset", required=True, choices=["s3d", "cc5k", "r2g"], help="Dataset label mapping to use"
    )
    parser.add_argument(
        "--input_filename",
        default="*.json",
        help="Filename to indentify what file to convert in case args.input is input folder",
    )
    parser.add_argument(
        "--keep_wd", action="store_true", help="Keep window and door instances (collapse rectangles back to lines)"
    )
    parser.add_argument(
        "--no_sem", action="store_true", help="Input has no room_type; assign default category_id 0 for all spaces"
    )

    args = parser.parse_args()

    if Path(args.input).is_dir():
        assert Path(args.output).is_dir() or not Path(args.output).exists()
        os.makedirs(args.output, exist_ok=True)
        input_files = sorted(Path(args.input).rglob(args.input_filename))
        for inp_file in input_files:
            image_id = inp_file.stem
            if image_id != args.input_filename:
                image_id = inp_file.parent.parent.name

            output_file = Path(args.output) / f"{image_id}.json"
            convert(inp_file, output_file, args.dataset, image_id=image_id, keep_wd=args.keep_wd, no_sem=args.no_sem)
    else:
        convert(args.input, args.output, args.dataset, keep_wd=args.keep_wd, no_sem=args.no_sem)


if __name__ == "__main__":
    main()
