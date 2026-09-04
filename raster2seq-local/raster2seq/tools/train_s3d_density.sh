#!/bin/bash
export NCCL_P2P_LEVEL=NVL

MASTER_PORT=23472
NUM_GPUS=1

CLS_COEFF=2
COO_COEFF=20
SEQ_LEN=512
NUM_BINS=32
CONVERTER=v3
JOB=s3dd_res256
OUTPUT_DIR=save_models

WANDB_MODE=online python -m torch.distributed.run --nproc_per_node=${NUM_GPUS} --master_port=$MASTER_PORT main_ddp.py --dataset_name=stru3d \
        --dataset_root=data/stru3d \
        --semantic_classes=-1 \
        --job_name=${JOB} \
        --batch_size 32 \
        --input_channels=1 \
        --output_dir ${OUTPUT_DIR} \
        --poly2seq \
        --seq_len ${SEQ_LEN} \
        --num_bins ${NUM_BINS} \
        --ckpt_every_epoch 50 \
        --eval_every_epoch 20 \
        --lr 2e-4 \
        --lr_backbone 2e-5 \
        --label_smoothing 0.0 \
        --epochs 500 \
        --lr_drop '' \
        --cls_loss_coef ${CLS_COEFF} \
        --coords_loss_coef ${COO_COEFF} \
        --resume ${OUTPUT_DIR}/${JOB}/checkpoint.pth \
        --ema4eval \
        --disable_poly_refine \
        --dec_attn_concat_src \
        --converter_version ${CONVERTER} \
        --use_anchor