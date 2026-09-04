import inspect
import json
import os
import sys
from os.path import isfile, join, realpath
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader
from tqdm import tqdm

sys.path.append(os.path.join(os.path.dirname(__file__), "evaluations"))
from clipseg_eval.general_utils import (
    AttributeDict,
    filter_args,
    get_attribute,
    score_config_from_cli_args,
)

sys.path.append(str(Path(__file__).resolve().parent.parent))
from datasets import build_dataset
from detectron2.data.detection_utils import annotations_to_instances

DATASET_CACHE = dict()


def load_model(
    checkpoint_id, weights_file=None, strict=True, model_args="from_config", with_config=False, ignore_weights=False
):

    config = json.load(open(join("logs", checkpoint_id, "config.json")))

    if model_args != "from_config" and type(model_args) != dict:
        raise ValueError('model_args must either be "from_config" or a dictionary of values')

    model_cls = get_attribute(config["model"])

    # load model
    if model_args == "from_config":
        _, model_args, _ = filter_args(config, inspect.signature(model_cls).parameters)

    model = model_cls(**model_args)

    if weights_file is None:
        weights_file = realpath(join("logs", checkpoint_id, "weights.pth"))
    else:
        weights_file = realpath(join("logs", checkpoint_id, weights_file))

    if isfile(weights_file) and not ignore_weights:
        weights = torch.load(weights_file)
        for _, w in weights.items():
            assert not torch.any(torch.isnan(w)), "weights contain NaNs"
        model.load_state_dict(weights, strict=strict)
    else:
        if not ignore_weights:
            raise FileNotFoundError(f"model checkpoint {weights_file} was not found")

    if with_config:
        return model, config

    return model


def read_pred_json(json_file_path, image_size=(256, 256), mask_format="bitmask"):
    # Read and parse the JSON file
    with open(json_file_path, "r") as file:
        predictions = json.load(file)
        for i, p in enumerate(predictions):
            predictions[i]["segmentation"] = [np.array(p["segmentation"]).flatten()]

    pred = annotations_to_instances(predictions, image_size, mask_format, no_boxes=True)
    return pred


def compute_shift2(model, datasets, seed=123, repetitions=1):
    """computes shift"""

    model.eval()
    model.cuda()

    import random

    random.seed(seed)

    preds, gts = [], []
    for i_dataset, dataset in enumerate(datasets):
        loader = DataLoader(dataset, batch_size=1, num_workers=0, shuffle=False, drop_last=False)

        max_iterations = int(repetitions * len(dataset.dataset.data_list))

        with torch.no_grad():
            i = []
            for i_all, (data_x, data_y) in enumerate(loader):
                data_x = [v.cuda(non_blocking=True) if v is not None else v for v in data_x]
                data_y = [v.cuda(non_blocking=True) if v is not None else v for v in data_y]

                (pred,) = model(data_x[0], data_x[1], data_x[2])
                preds += [pred.detach()]
                gts += [data_y]

                i += 1
                if max_iterations and i >= max_iterations:
                    break

    from metrics import FixedIntervalMetrics

    n_values = 25  # 51
    thresholds = np.linspace(0, 1, n_values)[1:-1]
    metric = FixedIntervalMetrics(resize_pred=True, sigmoid=True, n_values=n_values)

    for p, y in zip(preds, gts):
        metric.add(p.unsqueeze(1), y)

    best_idx = np.argmax(metric.value()["fgiou_scores"])
    best_thresh = thresholds[best_idx]

    return best_thresh


def get_cached_pascal_pfe(split, config):
    from datasets.pfe_dataset import PFEPascalWrapper

    try:
        dataset = DATASET_CACHE[(split, config.image_size, config.label_support, config.mask)]
    except KeyError:
        dataset = PFEPascalWrapper(
            mode="val", split=split, mask=config.mask, image_size=config.image_size, label_support=config.label_support
        )
        DATASET_CACHE[(split, config.image_size, config.label_support, config.mask)] = dataset
    return dataset


def main():
    config, train_checkpoint_id = score_config_from_cli_args()

    metrics = score(config, train_checkpoint_id, None)
    print(metrics)


def score(config, train_checkpoint_id, train_config):
    config = AttributeDict(config)
    print(config)

    metric_args = dict()

    if "threshold" in config:
        if config.metric.split(".")[-1] == "SkLearnMetrics":
            metric_args["threshold"] = config.threshold

    if "resize_to" in config:
        metric_args["resize_to"] = config.resize_to

    if "sigmoid" in config:
        metric_args["sigmoid"] = config.sigmoid

    if "custom_threshold" in config:
        metric_args["custom_threshold"] = config.custom_threshold

    if config.test_dataset == "waffle":
        coco_dataset = build_dataset(image_set="test", args=config)
        coco_dataset[0]

        def trivial_batch_collator(batch):
            """
            A batch collator that does nothing.
            """
            return batch

        loader = DataLoader(
            coco_dataset,
            batch_size=config.batch_size,
            num_workers=2,
            shuffle=False,
            drop_last=False,
            collate_fn=trivial_batch_collator,
        )
        metric = get_attribute(config.metric)(resize_pred=False, n_values=25, **metric_args)

        shift = config.shift if "shift" in config else 0
        pred_json_root = config.pred_json_root

        with torch.no_grad():
            i = 0
            for i_all, batch_data in enumerate(tqdm(loader)):
                image_path = batch_data[0]["file_name"]
                data_y = batch_data[0]["instances"].gt_masks.tensor[None, ...]
                gt_classes = batch_data[0]["instances"].gt_classes[None, ...]
                interior_mask = gt_classes == 0
                data_y = data_y[interior_mask][None, ...]
                data_y = torch.sum(data_y, dim=1, keepdim=True).clamp(0, 1)  # Shape: Bx1xHxW

                pred = read_pred_json(
                    os.path.join(pred_json_root, os.path.basename(image_path).split(".")[0] + ".json"),
                    image_size=(config.image_size, config.image_size),
                    mask_format=config.mask_format,
                )
                if len(pred) == 0:
                    pred = torch.zeros_like(data_y)
                else:
                    pred = pred.gt_masks.tensor[None, ...]
                    pred = torch.sum(pred, dim=1, keepdim=True).clamp(0, 1)  # Shape: Bx1xHxW
                metric.add(pred + shift, data_y)

                i += 1
                if config.max_iterations and i >= config.max_iterations:
                    break

        key_prefix = config["name"] if "name" in config else "coco"

        print(metric.scores())
        return {key_prefix: metric.scores()}


if __name__ == "__main__":
    main()
