#!/bin/bash
set -euo pipefail

# ============================================================
# INPUTS — set these before running
# ============================================================
JSON_FILE="$1"        # e.g., /data/sample/draft.json
IMAGE_A="$2"          # Original floorplan raster
IMAGE_B="$3"          # Vectorized rendering
IMAGE_C="$4"          # Overlaid rendering
IMAGE_D="$5"          # Adjacency graph
IMAGE_ID="$6"         # Unique identifier for this floorplan (e.g., "floor_042")
MODEL="${7:-gemini-2.5-pro}"  # Gemini model (default: gemini-3.1-pro-preview)
OUTPUT_DIRNAME="${8:-refinement}"  # Output dirname (default: refinement)

# ============================================================
# SETUP — derive paths and create directories
# ============================================================
BASE_DIR="$(dirname "$JSON_FILE")/"$OUTPUT_DIRNAME""
SAVE_DIR="$BASE_DIR/$IMAGE_ID"
mkdir -p "$SAVE_DIR/history" "$SAVE_DIR/jsons" "$SAVE_DIR/viz"

PROMPT_REFINE="vlm_refinement/prompts/prompt.txt"

echo "=== Iterative Floorplan Refinement ==="
echo "Input JSON : $JSON_FILE"
echo "Image ID   : $IMAGE_ID"
echo "Save dir   : $SAVE_DIR"
echo "Model      : $MODEL"

# ============================================================
# VLM-based refinement
# ============================================================

# Call Gemini CLI in non-interactive mode
#   - Pipe the prompt text + JSON content via cat
#   - Reference images via @file
#   - Save raw output to log

gemini -m "$MODEL" -p "$(cat "$PROMPT_REFINE")

## Input JSON:
$(cat "$JSON_FILE")

## Reference Images:
Original floorplan raster @${IMAGE_A}
Vectorized floorplan rendering @${IMAGE_B}
Vectorized floorplan rendering overlaid @${IMAGE_C}
Adjacency Graph @${IMAGE_D}" \
    --yolo \
    > "$SAVE_DIR/history/log_pass1.txt" 2>&1

echo "  Log saved: $SAVE_DIR/history/log_pass1.txt"

# Step 1.2: Extract JSON from \boxed{} in the log
python vlm_refinement/extract_boxed_json.py \
    "$SAVE_DIR/history/log_pass1.txt" \
    "$SAVE_DIR/jsons/pass1.json"

echo "  JSON saved: $SAVE_DIR/jsons/pass1.json"

# Step 1.3: Visualize the refined floorplan
python vlm_refinement/visualize_floorplan.py \
    --input "$SAVE_DIR/jsons/pass1.json" \
    --input_floorplan_raster "$(dirname "$(dirname "$JSON_FILE")")/${IMAGE_ID}.png" \
    --output "$SAVE_DIR/viz/" \
    --dataset cc5k \
    --pass_id 1 \

echo "  Viz saved: $SAVE_DIR/viz/"

# ============================================================
# DONE
# ============================================================
FINAL_JSON="$SAVE_DIR/jsons/pass1.json"
echo ""
echo "=== Refinement complete ==="
echo "Final JSON: $FINAL_JSON"