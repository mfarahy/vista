## Assume the Structured3D density dataset are downloaded
DATA=data/coco_s3d

for split in train val test; do
    python plot_floor.py --dataset_name=stru3d \
        --dataset_root=${DATA} \
        --eval_set=${split} \
        --output_dir=data/coco_s3d_bw/${split}/ \
        --semantic_classes=19 \
        --input_channels 3 \
        --disable_image_transform \
        --poly2seq \
        --image_size 256 \
        --image_scale 1 \
        --plot_gt \
        --is_bw \
        --plot_engine matplotlib

done

# Reuse the annotations
cp -r data/coco_s3d/annotations data/coco_s3d_bw/