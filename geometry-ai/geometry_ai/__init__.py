"""Vista geometry-ai feasibility package.

Provides a minimal, CPU-capable inference pipeline for the CubiCasa5K-trained
ResNet34-UNet segmentation model (MIT weights, Hugging Face
`Yytsi/floorplan-to-3d-walls`). The model predicts per-pixel labels for
`floor`, `wall`, `door` and `window`; this package turns the mask into a
JSON-able "raw model output" that the frontend AI adapter maps onto the
`VistaGeometry` schema.

This is a feasibility harness, not a production service.
"""

__version__ = "0.1.0"