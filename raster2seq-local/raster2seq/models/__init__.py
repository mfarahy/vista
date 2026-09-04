# ------------------------------------------------------------------------------------
# Modified from Deformable DETR (https://github.com/fundamentalvision/Deformable-DETR)
# ------------------------------------------------------------------------------------

from .raster2seq import build as build_v2
from .roomformer import build


def build_model(args, train=True, tokenizer=None):
    if not args.poly2seq:
        return build(args, train)
    return build_v2(args, train, tokenizer=tokenizer)
