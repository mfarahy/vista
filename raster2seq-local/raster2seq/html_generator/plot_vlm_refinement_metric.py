import os
import json
from pathlib import Path

# --- Configuration ---
anchor_dir = Path("results/cck_raster2seq_t1_nowd") # Path("results/cck_raster2seq_t1")
# anchor_dir2 = Path("results/cck_raster2seq_t1_nowd")
output_dir = Path("gen_htmls")
output_dir.mkdir(exist_ok=True, parents=True)
output_file = output_dir / "vlm_refinement_metric.html"

methods = [
    {"name": "Raster2Seq", "pred_dir": Path("results/cck_raster2seq_t1"), "json_dir": Path("results/cck_raster2seq_t1/result_jsons")},
    {"name": "Raster2Seq (wo wd)", "pred_dir": Path("results/cck_raster2seq_t1_nowd"), "json_dir": Path("results/cck_raster2seq_t1_nowd/result_jsons")},
    {"name": "VLM-Refine-v4 Pass1", "pred_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4/pass1"), "json_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4/pass1/result_jsons")},
    {"name": "VLM-Refine-v4 Pass2 (refine WD)", "pred_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4/pass2"), "json_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4/pass2/result_jsons")},
    # {"name": "VLM-Refine-v4 Pass1 (add occupancy map)", "pred_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4-2/pass1"), "json_dir": Path("results/cc5k_vlm_refinement_enhanced_N1_t4-2/pass1/result_jsons")},
    # {"name": "VLM-Refine-v1 Pass2", "pred_dir": Path("results/cck_vlm_refinement_t1/pass2"), "json_dir": Path("results/cck_vlm_refinement_t1/pass2/result_jsons")},
    # {"name": "VLM-Refine-v2 Pass1", "pred_dir": Path("results/cck_vlm_refinement_enhanced_t2/pass1"), "json_dir": Path("results/cck_vlm_refinement_enhanced_t2/pass1/result_jsons")},
    # {"name": "VLM-Refine-v2 Pass2", "pred_dir": Path("results/cck_vlm_refinement_enhanced_t2/pass2"), "json_dir": Path("results/cck_vlm_refinement_enhanced_t2/pass2/result_jsons")},
]

# metrics_keys = ["room_f1", "corner_f1", "angles_f1"]
metrics_keys = ["room_prec", "room_rec", "room_f1", 
                "corner_prec", "corner_rec", "corner_f1", 
                "angles_prec", "angles_rec", "angles_f1"]

# --- Discover image IDs ---
image_ids = sorted([p.stem for p in (anchor_dir / "result_jsons").glob("*.json")])

get_rel = lambda p: os.path.relpath(p, output_dir)


def load_metrics(json_path):
    with open(json_path) as f:
        data = json.load(f)
    return {k: data.get(k, None) for k in metrics_keys}


def fmt_metric(val):
    return f"{val:.4f}" if val is not None else "N/A"


# --- Build HTML ---
html_parts = []
html_parts.append("""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>VLM Refinement Metric Comparison</title>
<style>
body { font-family: Arial, sans-serif; margin: 20px; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 6px; text-align: center; vertical-align: top; }
th { position: sticky; top: 0; background: #f0f0f0; z-index: 1; }
img { width: 256px; height: 256px; display: block; }
.metrics-box {
    margin-top: 4px;
    padding: 4px 8px;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 12px;
    text-align: left;
    display: inline-block;
}
.metrics-box span { display: block; }
.metric-key { color: #666; }
.metric-val { font-weight: bold; }
</style>
</head>
<body>
<h2>VLM Refinement Metric Comparison</h2>
<table>
<thead>
<tr>
  <th>ID</th>
  <th>Input Raster</th>
  <th>Ground Truth</th>
""")

for m in methods:
    html_parts.append(f"  <th>{m['name']}</th>\n")

html_parts.append("</tr>\n</thead>\n<tbody>\n")

for img_id in image_ids:
    raster_path = get_rel(anchor_dir / f"{img_id}_raster.png")
    gt_path = get_rel(anchor_dir / f"{img_id}_gt_floorplan_sem.png")

    html_parts.append("<tr>\n")
    html_parts.append(f'  <td>{img_id}</td>\n')
    html_parts.append(f'  <td><img src="{raster_path}"></td>\n')
    html_parts.append(f'  <td><img src="{gt_path}"></td>\n')

    for m in methods:
        pred_path = get_rel(m["pred_dir"] / f"{img_id}_pred_floorplan_sem.png")
        metrics = load_metrics(m["json_dir"] / f"{img_id}.json")
        metrics_html = "".join(
            f'<span><span class="metric-key">{k}:</span> <span class="metric-val">{fmt_metric(v)}</span></span>'
            for k, v in metrics.items()
        )
        html_parts.append(
            f'  <td><img src="{pred_path}"><div class="metrics-box">{metrics_html}</div></td>\n'
        )

    html_parts.append("</tr>\n")

html_parts.append("</tbody>\n</table>\n</body>\n</html>")

output_file.write_text("".join(html_parts))
print(f"Saved HTML to {output_file}")
