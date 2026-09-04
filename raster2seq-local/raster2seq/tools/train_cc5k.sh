#!/bin/bash
export NCCL_P2P_LEVEL=NVL
 
MASTER_PORT=14159
NUM_GPUS=1

CLS_COEFF=5
COO_COEFF=20
SEQ_LEN=512
NUM_BINS=32
CONVERTER=v3

JOB=cc5k_res256
PRETRAIN=checkpoints/s3dbw_res256_ep1349.pth
OUTPUT_DIR=save_models

WANDB_MODE=online torchrun --nproc_per_node=${NUM_GPUS} --master_port=$MASTER_PORT main_ddp.py --dataset_name=cubicasa \
               --dataset_root=data/coco_cubicasa5k_nowalls_v4-1_refined/ \
               --semantic_classes=-1 \
               --job_name=${JOB} \
               --batch_size 56 \
               --input_channels=3 \
               --output_dir ${OUTPUT_DIR} \
               --poly2seq \
               --seq_len ${SEQ_LEN} \
               --num_bins ${NUM_BINS} \
               --ckpt_every_epoch=50 \
               --eval_every_epoch=50 \
               --label_smoothing 0.1 \
               --epochs 500 \
               --lr_drop '' \
               --cls_loss_coef ${CLS_COEFF} \
               --coords_loss_coef ${COO_COEFF} \
               --resume ${OUTPUT_DIR}/${JOB}/checkpoint.pth \
               --ema4eval \
               --disable_poly_refine \
               --dec_attn_concat_src \
               --converter_version ${CONVERTER} \
               --use_anchor \
               --start_from_checkpoint ${PRETRAIN}