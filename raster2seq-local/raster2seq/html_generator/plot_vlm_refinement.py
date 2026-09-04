import os
from pathlib import Path
from html4vision import Col, imagetable

data_path = Path("pred_outputs/cc5k_test_preds/checkpoints/structured_jsons/refinement_enhanced_N1_t4/") # Path("pred_outputs/cc5k_test_preds/checkpoints/structured_jsons/refinement_v2/")
initial_data_path = Path("pred_outputs/cc5k_test_preds/checkpoints/structured_jsons/viz")
gt_path = Path("pred_outputs/cc5k_test_preds/checkpoints/")
output_dir = Path("gen_htmls")
output_dir.mkdir(exist_ok=True, parents=True)
output_file = output_dir / "vlm_refinement.html"

get_rel_path = lambda path: os.path.relpath(path, output_dir)

object_ids = [x.name for x in sorted(data_path.iterdir())]

initial_pred_images = [get_rel_path(initial_data_path / _id / f"{_id}_floorplan_overlaid.png") for _id in object_ids]
pass1_pred_images = [get_rel_path(data_path / _id / f"viz/pass1_floorplan_overlaid.png") for _id in object_ids]
pass2_pred_images = [get_rel_path(data_path / _id / f"viz/pass2_floorplan_overlaid.png") for _id in object_ids]
input_images = [get_rel_path(initial_data_path / _id / f"{_id}_raster.png") for _id in object_ids]
# input_images = [get_rel_path(gt_path / f"{_id}.png") for _id in object_ids]

# table description
cols = [
    Col('id1', 'ID', object_ids),
    Col('img', 'Input Raster', input_images),     
    Col('img', 'Initial Pred (Raster2Seq)', initial_pred_images),
    Col('img', 'Pass1 Pred', pass1_pred_images),
    Col('img', 'Final Output', pass2_pred_images),
]

# html table generation
imagetable(cols, out_file=output_file, imsize=(256, 256))
print("Save html to", output_file)


