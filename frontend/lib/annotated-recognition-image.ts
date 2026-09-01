'use client';

import { RAW_COLORS } from '@/components/raw-floorplan-overlay';
import type { RawGeometry, LayerVisibility } from '@/components/raw-floorplan-overlay';

// Visual design for annotated image: semi-transparent overlays, clear outlines, readable IDs
// Uses same coordinate system as original image and reuses raw overlay rendering logic.

const ANNOTATED_COLORS = RAW_COLORS;

function polygonCentroid(polygon: number[][]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for annotation'));
    img.src = src;
  });
}

export async function generateAnnotatedImageDataUrl(params: {
  imageUrl: string;
  raw: RawGeometry;
  imageWidth: number;
  imageHeight: number;
  visibility?: Partial<LayerVisibility>;
}): Promise<string> {
  const { imageUrl, raw, imageWidth, imageHeight } = params;
  const visibility: LayerVisibility = {
    wall: true,
    door: true,
    entry_door: true,
    window: true,
    kitchen: true,
    door_center_line: false,
    entry_door_center_line: false,
    window_center_line: false,
    ...(params.visibility ?? {}),
  };

  const img = await loadImage(imageUrl);

  const canvas = document.createElement('canvas');
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  const g = ctx;

  // Draw original image scaled to canvas dimensions (image already at native size)
  g.drawImage(img, 0, 0, imageWidth, imageHeight);

  // Helper to draw polygon with semi-transparent fill + outline
  function drawPolygon(poly: number[][], fill: string, stroke: string, fillAlpha: number, strokeWidth: number, dash?: number[]) {
    if (poly.length < 3) return;
    g.beginPath();
    g.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
    g.closePath();
    g.fillStyle = hexToRgba(fill, fillAlpha);
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = strokeWidth;
    if (dash) g.setLineDash(dash);
    else g.setLineDash([]);
    g.stroke();
    g.setLineDash([]);
  }

  // Draw walls
  if (visibility.wall) {
    for (const poly of raw.wall) drawPolygon(poly, ANNOTATED_COLORS.wall, ANNOTATED_COLORS.wall, 0.28, 2.5);
  }
  if (visibility.door) {
    for (const poly of raw.door) drawPolygon(poly, ANNOTATED_COLORS.door, ANNOTATED_COLORS.door, 0.30, 2);
  }
  if (visibility.entry_door) {
    for (const poly of raw.entry_door) drawPolygon(poly, ANNOTATED_COLORS.entry_door, ANNOTATED_COLORS.entry_door, 0.32, 2.2);
  }
  if (visibility.window) {
    for (const poly of raw.window) drawPolygon(poly, ANNOTATED_COLORS.window, ANNOTATED_COLORS.window, 0.30, 2);
  }
  if (visibility.kitchen) {
    for (const poly of raw.kitchen) drawPolygon(poly, ANNOTATED_COLORS.kitchen, ANNOTATED_COLORS.kitchen, 0.26, 2, [6, 4]);
  }

  // Center lines if enabled
  if (visibility.door_center_line) {
    for (const poly of raw.door_center_line) {
      if (poly.length < 2) continue;
      g.beginPath();
      g.moveTo(poly[0][0], poly[0][1]);
      g.lineTo(poly[1][0], poly[1][1]);
      g.strokeStyle = ANNOTATED_COLORS.door_center_line;
      g.lineWidth = 2;
      g.setLineDash([8, 4]);
      g.stroke();
      g.setLineDash([]);
    }
  }
  if (visibility.window_center_line) {
    for (const poly of raw.window_center_line) {
      if (poly.length < 2) continue;
      g.beginPath();
      g.moveTo(poly[0][0], poly[0][1]);
      g.lineTo(poly[1][0], poly[1][1]);
      g.strokeStyle = ANNOTATED_COLORS.window_center_line;
      g.lineWidth = 2;
      g.setLineDash([8, 4]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  // Draw IDs with white halo for readability — same as raw overlay but ensure always visible for annotated genera
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  function drawLabel(text: string, cx: number, cy: number, fontSize: number, fill: string) {
    g.font = `600 ${fontSize}px sans-serif`;
    // white halo
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.strokeText(text, cx, cy);
    g.fillStyle = fill;
    g.fillText(text, cx, cy);
  }

  const labelCategories: Array<{ key: keyof LayerVisibility; prefix: string; size: number }> = [
    { key: 'wall', prefix: 'wall', size: Math.max(9, Math.round(imageWidth / 120)) },
    { key: 'door', prefix: 'door', size: 9 },
    { key: 'entry_door', prefix: 'entry_door', size: 9 },
    { key: 'window', prefix: 'window', size: 8 },
    { key: 'kitchen', prefix: 'kitchen', size: 10 },
  ];

  for (const cat of labelCategories) {
    if (!visibility[cat.key]) continue;
    const polys = (raw as unknown as Record<string, number[][][]>)[cat.key] ?? [];
    // category-specific text color: darker version of overlay color for distinction
    const colorMap: Record<string, string> = {
      wall: '#b71c1c',
      door: '#0d47a1',
      entry_door: '#4a148c',
      window: '#006064',
      kitchen: '#e65100',
    };
    for (let i = 0; i < polys.length; i++) {
      const poly = polys[i];
      if (!poly || poly.length === 0) continue;
      const c = polygonCentroid(poly);
      drawLabel(`${cat.prefix}-${i}`, c.x, c.y, cat.size, colorMap[cat.key] ?? '#000');
    }
  }

  // Add small legend watermark for VLM clarity (optional but helps grounding)
  // Draw a semi-transparent bottom bar indicating it's the annotated image
  // Keep minimal to not obscure architecture
  // ctx.fillStyle = 'rgba(255,255,255,0.88)';
  // ctx.fillRect(0, imageHeight - 22, imageWidth, 22);
  // ctx.fillStyle = '#333';
  // ctx.font = '600 10px sans-serif';
  // ctx.textAlign = 'left';
  // ctx.fillText('ANNOTATED RECOGNITION — labels: wall-* door-* window-* kitchen-*', 6, imageHeight - 8);

  return canvas.toDataURL('image/png');
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
