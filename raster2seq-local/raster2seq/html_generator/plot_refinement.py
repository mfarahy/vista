import os
from pathlib import Path
from html4vision import Col, imagetable

data_path = Path("pred_outputs/cc5k_test_refine_conf0.9_preds/checkpoints/refinement_tracks")
gt_path = Path("output_gt_cc5k_refined_v4-1/test/")
output_dir = Path("gen_htmls")
output_dir.mkdir(exist_ok=True, parents=True)
output_file = output_dir / "refinement.html"

get_rel_path = lambda path: os.path.relpath(path, output_dir)


initial_pred_images = sorted(data_path.rglob("*_pass1.png"))
image_ids = [x.stem.split('_')[0] for x in initial_pred_images]

initial_pred_images = [get_rel_path(data_path / f"{_id}_pass1.png") for _id in image_ids]
good_to_keep_images = [get_rel_path(data_path / f"{_id}_good.png") for _id in image_ids]
final_images = [get_rel_path(data_path / f"{_id}_final.png") for _id in image_ids]
input_images = [get_rel_path(data_path.parent / f"{_id}.png") for _id in image_ids]
gt_images = [get_rel_path(gt_path / f"{_id}_floor.png") for _id in image_ids]



# table description
cols = [
    Col('id1', 'ID', image_ids),
    Col('img', 'Input Raster', input_images),     
    Col('img', 'GT', gt_images),
    Col('img', 'Initial Pred', initial_pred_images),
    Col('img', 'Good-to-keep Pred', good_to_keep_images),
    Col('img', 'Final Pred', final_images),
]

# html table generation
imagetable(cols, out_file=output_file, imsize=(768, 768))


