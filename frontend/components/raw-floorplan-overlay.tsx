'use client';

export type RawGeometry = {
  wall: number[][][];
  door: number[][][];
  entry_door: number[][][];
  window: number[][][];
  kitchen: number[][][];
  door_center_line: number[][][];
  entry_door_center_line: number[][][];
  window_center_line: number[][][];
  [key: string]: unknown;
};

export type LayerVisibility = {
  wall: boolean;
  door: boolean;
  entry_door: boolean;
  window: boolean;
  kitchen: boolean;
  door_center_line: boolean;
  entry_door_center_line: boolean;
  window_center_line: boolean;
};

export const RAW_COLORS: Record<keyof LayerVisibility, string> = {
  wall: '#e53935',
  door: '#1e88e5',
  entry_door: '#8e24aa',
  window: '#00acc1',
  kitchen: '#fb8c00',
  door_center_line: '#1e88e5',
  entry_door_center_line: '#8e24aa',
  window_center_line: '#00acc1',
};

function polygonPoints(polygon: number[][]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

function centroid(polygon: number[][]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const [px, py] of polygon) {
    x += px;
    y += py;
  }
  return { x: x / polygon.length, y: y / polygon.length };
}

export function RawFloorplanOverlay({
  imageUrl,
  imageWidth,
  imageHeight,
  raw,
  visibility,
  showIds,
  showImage,
}: {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  raw: RawGeometry;
  visibility: LayerVisibility;
  showIds: boolean;
  showImage: boolean;
}) {
  if (!imageWidth || !imageHeight) return null;
  const viewBox = `0 0 ${imageWidth} ${imageHeight}`;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border bg-white">
      <div className="relative w-full" style={{ aspectRatio: `${imageWidth}/${imageHeight}` }}>
        {showImage && imageUrl ? (
          <img
            src={imageUrl}
            alt="Floorplan source"
            className="absolute inset-0 h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-white" />
        )}
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'none' }}
        >
          {/* wall polygons */}
          {visibility.wall &&
            raw.wall.map((poly, i) => (
              <polygon
                key={`wall-${i}`}
                points={polygonPoints(poly)}
                fill={RAW_COLORS.wall}
                fillOpacity={0.35}
                stroke={RAW_COLORS.wall}
                strokeWidth={2}
                strokeOpacity={0.9}
              />
            ))}
          {visibility.door &&
            raw.door.map((poly, i) => (
              <polygon
                key={`door-${i}`}
                points={polygonPoints(poly)}
                fill={RAW_COLORS.door}
                fillOpacity={0.35}
                stroke={RAW_COLORS.door}
                strokeWidth={2}
              />
            ))}
          {visibility.entry_door &&
            raw.entry_door.map((poly, i) => (
              <polygon
                key={`entry_door-${i}`}
                points={polygonPoints(poly)}
                fill={RAW_COLORS.entry_door}
                fillOpacity={0.4}
                stroke={RAW_COLORS.entry_door}
                strokeWidth={2}
              />
            ))}
          {visibility.window &&
            raw.window.map((poly, i) => (
              <polygon
                key={`window-${i}`}
                points={polygonPoints(poly)}
                fill={RAW_COLORS.window}
                fillOpacity={0.35}
                stroke={RAW_COLORS.window}
                strokeWidth={2}
              />
            ))}
          {visibility.kitchen &&
            raw.kitchen.map((poly, i) => (
              <polygon
                key={`kitchen-${i}`}
                points={polygonPoints(poly)}
                fill={RAW_COLORS.kitchen}
                fillOpacity={0.3}
                stroke={RAW_COLORS.kitchen}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            ))}
          {/* center lines */}
          {visibility.door_center_line &&
            raw.door_center_line.map((poly, i) => {
              if (poly.length < 2) return null;
              const [a, b] = poly;
              return (
                <line
                  key={`dcl-${i}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={RAW_COLORS.door_center_line}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  strokeLinecap="round"
                />
              );
            })}
          {visibility.entry_door_center_line &&
            raw.entry_door_center_line.map((poly, i) => {
              if (poly.length < 2) return null;
              const [a, b] = poly;
              return (
                <line
                  key={`edcl-${i}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={RAW_COLORS.entry_door_center_line}
                  strokeWidth={2.5}
                  strokeDasharray="8 4"
                  strokeLinecap="round"
                />
              );
            })}
          {visibility.window_center_line &&
            raw.window_center_line.map((poly, i) => {
              if (poly.length < 2) return null;
              const [a, b] = poly;
              return (
                <line
                  key={`wcl-${i}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={RAW_COLORS.window_center_line}
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  strokeLinecap="round"
                />
              );
            })}

          {/* IDs */}
          {showIds && (
            <>
              {visibility.wall &&
                raw.wall.map((poly, i) => {
                  const c = centroid(poly);
                  return (
                    <text key={`wall-id-${i}`} x={c.x} y={c.y} fontSize={10} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">
                      wall-{i}
                    </text>
                  );
                })}
              {visibility.door &&
                raw.door.map((poly, i) => {
                  const c = centroid(poly);
                  return (
                    <text key={`door-id-${i}`} x={c.x} y={c.y} fontSize={10} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">
                      door-{i}
                    </text>
                  );
                })}
              {visibility.entry_door &&
                raw.entry_door.map((poly, i) => {
                  const c = centroid(poly);
                  return (
                    <text key={`entry-door-id-${i}`} x={c.x} y={c.y} fontSize={10} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">
                      entry_door-{i}
                    </text>
                  );
                })}
              {visibility.window &&
                raw.window.map((poly, i) => {
                  const c = centroid(poly);
                  return (
                    <text key={`window-id-${i}`} x={c.x} y={c.y} fontSize={9} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">
                      window-{i}
                    </text>
                  );
                })}
              {visibility.kitchen &&
                raw.kitchen.map((poly, i) => {
                  const c = centroid(poly);
                  return (
                    <text key={`kitchen-id-${i}`} x={c.x} y={c.y} fontSize={10} fill="#000" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={3} strokeLinejoin="round">
                      kitchen-{i}
                    </text>
                  );
                })}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

export function computeMaxCoord(raw: RawGeometry): { maxX: number; maxY: number } {
  let maxX = 0;
  let maxY = 0;
  const categories: (keyof LayerVisibility)[] = ['wall', 'door', 'entry_door', 'window', 'kitchen', 'door_center_line', 'entry_door_center_line', 'window_center_line'];
  for (const key of categories) {
    const polys = raw[key] as number[][][];
    for (const poly of polys ?? []) {
      for (const [x, y] of poly) {
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { maxX: Math.round(maxX), maxY: Math.round(maxY) };
}

export function detectUnknownFields(raw: Record<string, unknown>): string[] {
  const known = new Set(['wall', 'door', 'entry_door', 'window', 'kitchen', 'door_center_line', 'entry_door_center_line', 'window_center_line']);
  return Object.keys(raw).filter((k) => !known.has(k));
}
