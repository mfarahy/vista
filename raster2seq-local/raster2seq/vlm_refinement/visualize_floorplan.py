"""Visualize structured floorplan JSON as separate images.

Outputs 3 images:
  <image_id>_floorplan.png          - filled polygon floorplan
  <image_id>_graph.png              - adjacency bubble diagram
  <image_id>_floorplan_overlaid.png - polygons overlaid on input raster

Usage:
    python vlm_refinement/visualize_floorplan.py \
        --input pred_outputs/s3d_test_preds/checkpoints/structured_jsons/03315_structured.json \
        --input_floorplan_raster <path_to_raster.png> \
        --output /tmp/vis_output/ \
        --dataset s3d
"""

import argparse
import json
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.colors as mcolors
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from plotly.colors import qualitative

# Color palette from plotly qualitative sets (matches util/plot_utils.py approach)
_COLORS = list(qualitative.Set3) + list(qualitative.Dark2)


def _build_semantics_cmap():
    """Build category_id -> hex color mapping from plotly qualitative palettes."""
    cmap = {}
    for i, color in enumerate(_COLORS):
        # plotly colors are 'rgb(R,G,B)' strings — convert to hex
        if color.startswith("rgb("):
            r, g, b = [int(x) for x in color[4:-1].split(",")]
            cmap[i] = f"#{r:02x}{g:02x}{b:02x}"
        else:
            cmap[i] = color
    return cmap


semantics_cmap = _build_semantics_cmap()

# Label mappings (same as structure_json_convert.py)
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

LABEL_MAPS = {"s3d": S3D_LABEL, "cc5k": CC5K_LABEL, "r2g": R2G_LABEL}
FALLBACK_COLOR = "#cccccc"


def build_color_lookup(dataset):
    """Build room_type string -> hex color mapping."""
    label_map = LABEL_MAPS[dataset]
    inverted = {v: k for k, v in label_map.items()}
    lookup = {}
    for label_str, cat_id in inverted.items():
        lookup[label_str] = semantics_cmap.get(cat_id, FALLBACK_COLOR)
    return lookup


def compute_centroid(floor_polygon):
    """Average of vertices."""
    xs = [p["x"] for p in floor_polygon]
    ys = [p["y"] for p in floor_polygon]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def compute_area(floor_polygon):
    """Shoelace formula for polygon area."""
    n = len(floor_polygon)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += floor_polygon[i]["x"] * floor_polygon[j]["y"]
        area -= floor_polygon[j]["x"] * floor_polygon[i]["y"]
    return abs(area) / 2.0


def _setup_ax(ax, img_w=256, img_h=256):
    """Common axis setup for 256x256 coordinate space."""
    ax.set_xlim(0, img_w)
    ax.set_ylim(img_h, 0)  # Invert y to match image coords
    ax.set_aspect("equal")
    ax.axis("off")


def _save_figure(fig, path):
    """Save figure and close."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    fig.savefig(path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved -> {path}")


def visualize(
    input_path,
    input_floorplan_raster,
    output_dir,
    dataset,
    pass_id=None,
    plot_text_labels=True,
    plot_occupancy_map=False,
    no_sem=False,
):
    try:
        with open(input_path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error loading {input_path}: {e}")
        return
    except Exception as e:
        print(f"Unexpected error loading {input_path}: {e}")
        return

    if pass_id is not None:
        image_id = f"pass{pass_id}"
    else:
        image_id = os.path.splitext(os.path.basename(input_path))[0]
    spaces = data["spaces"]

    # Sort spaces by area (descending) so smaller rooms are drawn on top of larger ones
    spaces = sorted(spaces, key=lambda s: compute_area(s["floor_polygon"]), reverse=True)

    if no_sem:
        # Use uniform gray for all spaces when no semantic labels
        gray_hex = "#999999"
        gray_rgba = mcolors.to_rgba(gray_hex, alpha=0.6)
        color_lookup = {space["id"]: gray_hex for space in spaces}
        color_lookup_rgba = {space["id"]: gray_rgba for space in spaces}
    else:
        color_lookup = build_color_lookup(dataset)
        color_lookup_rgba = {}
        for _id in color_lookup:
            color_lookup_rgba[_id] = mcolors.to_rgba(color_lookup[_id], alpha=0.6)

    # Precompute centroids
    centroids = {}
    for space in spaces:
        cx, cy = compute_centroid(space["floor_polygon"])
        centroids[space["id"]] = (cx, cy)

    os.makedirs(output_dir, exist_ok=True)

    txt_box_alpha = 0.7

    def _get_color_key(space):
        return space["id"] if no_sem else space.get("room_type", space["id"])

    # --- Figure 1: filled polygon floorplan ---
    fig, ax = plt.subplots(1, 1, figsize=(6, 6))
    for space in spaces:
        verts = [(p["x"], p["y"]) for p in space["floor_polygon"]]
        color = color_lookup_rgba.get(_get_color_key(space), FALLBACK_COLOR)

        # Fill only
        poly = mpatches.Polygon(verts, closed=True, facecolor=color, alpha=1.0, edgecolor="none", zorder=1)
        ax.add_patch(poly)

        # Boundary only
        edge = mpatches.Polygon(verts, closed=True, facecolor="none", edgecolor="black", linewidth=1.5, zorder=2)
        ax.add_patch(edge)

        if plot_text_labels:
            cx, cy = centroids[space["id"]]
            ax.text(
                cx,
                cy,
                space["id"],
                fontsize=5,
                ha="center",
                va="center",
                zorder=3,
                bbox=dict(facecolor="white", alpha=txt_box_alpha, edgecolor="none"),
            )
    _setup_ax(ax)
    ax.set_title("Floorplan")
    _save_figure(fig, os.path.join(output_dir, f"{image_id}_floorplan.png"))

    # --- Figure 2: adjacency bubble diagram ---
    fig, ax = plt.subplots(1, 1, figsize=(6, 6))
    drawn_edges = set()
    for space in spaces:
        sid = space["id"]
        for neighbor_id in space.get("graph", []):
            edge_key = tuple(sorted([sid, neighbor_id]))
            if edge_key in drawn_edges:
                continue
            drawn_edges.add(edge_key)
            if neighbor_id in centroids:
                c1 = centroids[sid]
                c2 = centroids[neighbor_id]
                ax.plot([c1[0], c2[0]], [c1[1], c2[1]], color="black", linewidth=0.8, zorder=1)
    for space in spaces:
        cx, cy = centroids[space["id"]]
        color = color_lookup_rgba.get(_get_color_key(space), FALLBACK_COLOR)
        ax.scatter(cx, cy, s=800, color=color, edgecolors="black", alpha=1.0, linewidths=1.5, zorder=2)
        ax.text(
            cx,
            cy,
            space["id"],
            fontsize=4,
            ha="center",
            va="center",
            zorder=3,
            bbox=dict(facecolor="white", alpha=txt_box_alpha, edgecolor="none"),
        )
    _setup_ax(ax)
    ax.set_title("Adjacency Graph")
    _save_figure(fig, os.path.join(output_dir, f"{image_id}_graph.png"))

    # --- Figure 3: polygons overlaid on floorplan raster ---
    raster_img = plt.imread(input_floorplan_raster)
    img_h, img_w = raster_img.shape[:2]
    fig, ax = plt.subplots(1, 1, figsize=(6, 6))
    ax.imshow(raster_img, extent=[0, img_w, img_h, 0])
    for space in spaces:
        verts = [(p["x"], p["y"]) for p in space["floor_polygon"]]
        color = color_lookup.get(_get_color_key(space), FALLBACK_COLOR)
        poly = mpatches.Polygon(
            verts, closed=True, facecolor=color, alpha=0.6, edgecolor="none", linewidth=1.5, zorder=1
        )
        ax.add_patch(poly)
        if plot_text_labels:
            cx, cy = centroids[space["id"]]
            ax.text(
                cx,
                cy,
                space["id"],
                fontsize=5,
                ha="center",
                va="center",
                zorder=2,
                bbox=dict(facecolor="white", alpha=txt_box_alpha, edgecolor="none"),
            )
    _setup_ax(ax, img_w, img_h)
    ax.set_title("Floorplan Overlaid")
    _save_figure(fig, os.path.join(output_dir, f"{image_id}_floorplan_overlaid.png"))

    # --- Figure 4: original floorplan raster ---
    fig, ax = plt.subplots(1, 1, figsize=(6, 6))
    ax.imshow(raster_img, extent=[0, img_w, img_h, 0])
    _setup_ax(ax, img_w, img_h)
    ax.set_title("Original Floorplan Raster")
    _save_figure(fig, os.path.join(output_dir, f"{image_id}_raster.png"))

    # --- Figure 5: occupancy map (single-color polygons on raster) ---
    if plot_occupancy_map:
        occupancy_color = "#FFD700"
        fig, ax = plt.subplots(1, 1, figsize=(6, 6))
        ax.imshow(raster_img, extent=[0, img_w, img_h, 0])
        for space in spaces:
            verts = [(p["x"], p["y"]) for p in space["floor_polygon"]]
            poly = mpatches.Polygon(
                verts, closed=True, facecolor=occupancy_color, alpha=0.6, edgecolor="black", linewidth=1.0, zorder=1
            )
            ax.add_patch(poly)
        _setup_ax(ax, img_w, img_h)
        ax.set_title("Occupancy Map")
        _save_figure(fig, os.path.join(output_dir, f"{image_id}_occupancy.png"))


def main():
    parser = argparse.ArgumentParser(description="Visualize structured floorplan JSON")
    parser.add_argument("--input", required=True, help="Path to structured JSON file")
    parser.add_argument("--input_floorplan_raster", required=True, help="Path to floorplan raster")
    parser.add_argument("--output", required=True, help="Output directory for PNG files")
    parser.add_argument("--dataset", required=True, choices=["s3d", "cc5k", "r2g"], help="Dataset for color mapping")
    parser.add_argument(
        "--pass_id", type=int, default=None, help="Pass ID for iterative refinement (overrides filename-based naming)"
    )
    parser.add_argument(
        "--plot_text_labels",
        type=int,
        default=1,
        choices=[0, 1],
        help="Whether to plot text labels on floorplan figures (default: 1)",
    )
    parser.add_argument(
        "--plot_occupancy_map",
        type=int,
        default=0,
        choices=[0, 1],
        help="Whether to plot occupancy map with single-color polygons on raster (default: 0)",
    )
    parser.add_argument("--no_sem", action="store_true", help="No semantic labels; assign random colors to spaces")
    parser.add_argument(
        "--hard_structure",
        type=int,
        default=0,
        choices=[0, 1],
        help="Use this to determine if hard structure of directory is applied. This is predetermined",
    )
    args = parser.parse_args()

    if Path(args.input).is_dir():
        assert Path(args.input_floorplan_raster).is_dir()

        if args.hard_structure == 1:
            # Per-ID folder structure: {input}/{id}/jsons/pass{pass_id}.json
            input_dirs = sorted(d for d in Path(args.input).iterdir() if d.is_dir())
            for inp_dir in input_dirs:
                floorplan_id = inp_dir.name
                json_path = inp_dir / "jsons" / f"pass{args.pass_id}.json"
                raster_path = Path(args.input_floorplan_raster) / f"{floorplan_id}.png"
                if not json_path.exists():
                    print(f"Warning: {json_path} not found, skipping")
                    continue
                if not raster_path.exists():
                    print(f"Warning: {raster_path} not found, skipping")
                    continue
                output_dir = Path(args.output) / floorplan_id / "viz"
                output_dir.mkdir(exist_ok=True, parents=True)
                visualize(
                    json_path,
                    raster_path,
                    output_dir,
                    args.dataset,
                    args.pass_id,
                    bool(args.plot_text_labels),
                    bool(args.plot_occupancy_map),
                    args.no_sem,
                )
        else:
            # Flat directory of JSON files
            input_jsons = sorted(Path(args.input).glob("*.json"))
            input_rasters = [Path(args.input_floorplan_raster) / f"{path.stem}.png" for path in input_jsons]
            for _json_path, _raster_path in zip(input_jsons, input_rasters):
                output_dir = Path(args.output) / _json_path.stem
                output_dir.mkdir(exist_ok=True, parents=True)
                visualize(
                    _json_path,
                    _raster_path,
                    output_dir,
                    args.dataset,
                    args.pass_id,
                    bool(args.plot_text_labels),
                    bool(args.plot_occupancy_map),
                    args.no_sem,
                )

    else:
        visualize(
            args.input,
            args.input_floorplan_raster,
            args.output,
            args.dataset,
            args.pass_id,
            bool(args.plot_text_labels),
            bool(args.plot_occupancy_map),
            args.no_sem,
        )


if __name__ == "__main__":
    main()
