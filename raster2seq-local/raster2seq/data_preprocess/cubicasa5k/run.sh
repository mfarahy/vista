# create COCO-style dataset for CubiCasa5k
python create_coco_cc5k.py --data_root=data/cubicasa5k/ \
    --output=data/coco_cubicasa5k_nowalls_v4/ \
    --disable_wd2line

# Split example has more than 1 floorplan into separate samples
python floorplan_extraction.py \
    --data_root data/coco_cubicasa5k_nowalls_v4/ \
    --output data/coco_cubicasa5k_nowalls_v4-1_refined/

# Merge individual JSONs into single JSON file per split (train/val/test)
# This must be done after floorplan_extraction.py
python combine_json.py \
    --input data/coco_cubicasa5k_nowalls_v4-1_refined/ \
    --output data/coco_cubicasa5k_nowalls_v4-1_refined/annotations/ \