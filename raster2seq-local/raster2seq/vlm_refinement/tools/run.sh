
INPUT_DIR=pred_outputs/cc5k_test_preds/checkpoints/
OUTPUT_DIR=pred_outputs/cc5k_test_preds/checkpoints/structured_jsons_test/
OBJ_ID=05927

python vlm_refinement/structure_json_convert.py \
    --input ${INPUT_DIR}/jsons/${OBJ_ID}.json \
    --output ${OUTPUT_DIR}/${OBJ_ID}.json \
    --dataset cc5k

python vlm_refinement/visualize_floorplan.py \
    --input ${OUTPUT_DIR} \
    --input_floorplan_raster ${INPUT_DIR} \
    --output ${OUTPUT_DIR}/viz/ \
    --dataset cc5k

#### RUN FINEMET WITH VLM
MODEL=gemini-2.5-pro
OUTPUT_DIRNAME=refinement_results

./vlm_refinement/tools/run_gemini.sh \
    ${OUTPUT_DIR}/$OBJ_ID.json \
    ${OUTPUT_DIR}/viz/$OBJ_ID/${OBJ_ID}_raster.png \
    ${OUTPUT_DIR}/viz/$OBJ_ID/${OBJ_ID}_floorplan.png \
    ${OUTPUT_DIR}/viz/$OBJ_ID/${OBJ_ID}_floorplan_overlaid.png \
    ${OUTPUT_DIR}/viz/$OBJ_ID/${OBJ_ID}_graph.png \
    ${OBJ_ID} \
    ${MODEL} \
    ${OUTPUT_DIRNAME}