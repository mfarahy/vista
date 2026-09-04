#!/usr/bin/env bash

# Additional useful arguments: 
# --crop_white_space: remove redundant whitespace from the rendering 
# --one_color: use single color for every room (i.e. yellow)
# --compute_stats: compute statistics of the dataset (e.g. max_num_pts, max_num_polys) 
# and plot histogram for counting number of Points, Rooms, Corners
# --drop_wd: disable Windor & Door in the plots
# --image_scale: adjust rendering resolution of the plots

SPLIT=test
python plot_floor.py --dataset_name=stru3d \
               --dataset_root=data/coco_s3d_bw/ \
               --eval_set=${SPLIT} \
               --output_dir=data_plots/output_gt_s3dbw/${SPLIT} \
               --semantic_classes=19 \
               --input_channels 3 \
               --disable_image_transform \
               --poly2seq \
               --image_size 256 \
               --image_scale 1 \
               --compute_stats \
               --plot_gt \
               --plot_gt_image \
               --plot_polys \
               --plot_density


SPLIT=test
python plot_floor.py --dataset_name=r2g \
               --dataset_root=data/R2G_hr_dataset_processed_v1/ \
               --eval_set=${SPLIT} \
               --output_dir=output_gt_r2g/${SPLIT} \
               --semantic_classes=13 \
               --input_channels 3 \
               --poly2seq \
               --disable_image_transform \
               --image_size 256 \
               --image_scale 1 \
               --compute_stats \
               --plot_gt \
               --plot_polys \
               --plot_density


SPLIT=test
python plot_floor.py --dataset_name=cubicasa \
               --dataset_root=data/coco_cubicasa5k_nowalls_v4-1_refined \
               --eval_set=${SPLIT} \
               --output_dir=data_plots/output_gt_cc5k/${SPLIT} \
               --semantic_classes=12 \
               --input_channels 3 \
               --disable_image_transform \
               --poly2seq \
               --image_size 256 \
               --image_scale 1 \
               --compute_stats \
               --plot_gt \
               --plot_polys \
               --plot_density