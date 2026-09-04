# preprocess raw Raster2Graph high-resolution dataset
python -m data_preprocess.raster2graph.image_process --data_root=data/R2G_hr_dataset/

# convert to COCO-style dataset
python -m data_preprocess.raster2graph.convert_to_coco --dataset_path data/R2G_hr_dataset/ --output_dir data/R2G_hr_dataset_processed/

# combine JSON files into single JSON file per split
python -m data_preprocess.raster2graph.combine_json \
    --input data/R2G_hr_dataset_processed/ \
    --output data/R2G_hr_dataset_processed_v1/ \

rm -rf data/R2G_hr_dataset_processed/