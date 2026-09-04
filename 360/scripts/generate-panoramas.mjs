// Generates the three sample equirectangular panorama images for the spatial
// navigation prototype (Phase 4).
//
//   node scripts/generate-panoramas.mjs
//
// Pure Node, no dependencies: each panorama is painted procedurally and
// encoded as a PNG with zlib. The layout (room positions, orientations and
// links) is imported from `src/panoramas.js` so that the doorways painted
// into each image always match the navigation arrows of the viewer:
// every link is painted as a doorway carrying the target room's letter, at
// exactly the yaw the navigation arrow uses.
//
// Yaw/pitch mapping (matches Pannellum / standard equirectangular):
//   x = (yaw + 180) / 360 * width     yaw -180°..+180° → left..right
//   y = (90 - pitch) / 180 * height   pitch +90°..-90° → top..bottom

import zlib from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LINKS, PANORAMAS, linkYaw, worldYawBetween } from '../src/panoramas.js'
import { EYE_HEIGHT_M } from '../src/coordinates.js'
import { WINDOWS } from '../src/floorplan.js'
import { windowFloorSegment, windowTopM, windowWorldCorners } from '../src/windowGeometry.js'
import { worldPointToYawPitch } from '../src/panoramaProjection.js'

const WIDTH = 1920
const HEIGHT = 960

// ---------------------------------------------------------------- helpers

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function shade([r, g, b], k) {
  return [clamp(Math.round(r * k), 0, 255), clamp(Math.round(g * k), 0, 255), clamp(Math.round(b * k), 0, 255)]
}

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
}

function makeCanvas() {
  const data = Buffer.alloc(WIDTH * HEIGHT * 3)
  return {
    set(x, y, [r, g, b]) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return
      const i = (y * WIDTH + x) * 3
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
    },
    fill(x0, y0, x1, y1, color) {
      const xa = clamp(Math.round(x0), 0, WIDTH - 1)
      const xb = clamp(Math.round(x1), 0, WIDTH - 1)
      const ya = clamp(Math.round(y0), 0, HEIGHT - 1)
      const yb = clamp(Math.round(y1), 0, HEIGHT - 1)
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) this.set(x, y, color)
    },
    // Rectangle in (yaw, pitch) space, in degrees. Handles spans that wrap
    // across the ±180° seam of the equirectangular image.
    fillYawRect(yawMin, yawMax, pitchTop, pitchBottom, color) {
      if (yawMin < -180) this.fillYawRect(yawMin + 360, 180, pitchTop, pitchBottom, color)
      if (yawMax > 180) this.fillYawRect(-180, yawMax - 360, pitchTop, pitchBottom, color)
      yawMin = clamp(yawMin, -180, 180)
      yawMax = clamp(yawMax, -180, 180)
      if (yawMin >= yawMax) return
      const x0 = ((yawMin + 180) / 360) * WIDTH
      const x1 = ((yawMax + 180) / 360) * WIDTH
      const y0 = ((90 - pitchTop) / 180) * HEIGHT
      const y1 = ((90 - pitchBottom) / 180) * HEIGHT
      this.fill(x0, y0, x1, y1, color)
    },
    // Horizontal band between two pitches, with a subtle brightness sweep
    // across yaw (brightest at yaw 0, darkest at the seam) that makes camera
    // rotation visually verifiable.
    fillBand(pitchTop, pitchBottom, color, { sweep = 0.07, vertical = 0 } = {}) {
      const y0 = ((90 - pitchTop) / 180) * HEIGHT
      const y1 = ((90 - pitchBottom) / 180) * HEIGHT
      for (let y = Math.round(y0); y <= Math.round(y1); y++) {
        const v = 1 + vertical * (y - y0) / (y1 - y0 || 1)
        for (let x = 0; x < WIDTH; x++) {
          const k = v * (1 + sweep * Math.cos((2 * Math.PI * (x - WIDTH / 2)) / WIDTH))
          this.set(x, y, shade(color, k))
        }
      }
    },
    fillPixelShape(x, y, color) {
      this.set(x, y, color)
    },
    // 5x7 bitmap letter centered on (yaw, pitch), scaled to `cell` px per dot.
    drawLetter(letter, yaw, pitch, cell, color) {
      const glyph = FONT[letter]
      if (!glyph) throw new Error(`no glyph for "${letter}"`)
      const w = glyph[0].length * cell
      const h = glyph.length * cell
      const cx = ((yaw + 180) / 360) * WIDTH
      const cy = ((90 - pitch) / 180) * HEIGHT
      const x0 = Math.round(cx - w / 2)
      const y0 = Math.round(cy - h / 2)
      for (let r = 0; r < glyph.length; r++)
        for (let c = 0; c < glyph[r].length; c++)
          if (glyph[r][c] === '1') this.fill(x0 + c * cell, y0 + r * cell, x0 + (c + 1) * cell, y0 + (r + 1) * cell, color)
    },
    data,
  }
}

// ------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  // Data region is [8, 8 + data.length); CRC slot follows at [8+len, 12+len).
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(canvas) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(WIDTH, 0)
  ihdr.writeUInt32BE(HEIGHT, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  const stride = WIDTH * 3
  const raw = Buffer.alloc((stride + 1) * HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    canvas.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------ room palette

const ROOM_THEME = {
  'living-room': {
    letter: 'A',
    // Wall position of the room letter, away from all link directions.
    letterYaw: 180,
    wall: [201, 164, 116], // warm sand
    ceiling: [241, 230, 205],
    floor: [139, 106, 74], // wood
  },
  kitchen: {
    letter: 'B',
    letterYaw: 0,
    wall: [125, 168, 160], // sage green
    ceiling: [227, 236, 224],
    floor: [152, 158, 164], // light gray
  },
  bedroom: {
    letter: 'C',
    letterYaw: 180,
    wall: [140, 147, 184], // dusty blue
    ceiling: [232, 230, 240],
    floor: [96, 101, 120],
  },
}

const COMPASS_YAWS = [0, 90, 180, -90]
const COMPASS_COLORS = [
  [200, 68, 60],
  [60, 138, 79],
  [226, 170, 50],
  [70, 110, 200],
]

// ---------------------------------------------------------------- painting

// Paints every floor-plan window belonging to `pano` via exact ray-vs-wall
// intersection, so the painted window sits at precisely the spatial
// direction the geometry-based 360 overlay projects. No duplicated
// coordinates: wall plane, along-wall extents and heights all come from
// `WINDOWS` / `windowFloorSegment()`.
function paintWindows(canvas, pano) {
  const camX = pano.position.x
  const camY = EYE_HEIGHT_M
  const camZ = pano.position.y
  const cameraPos = { x: camX, y: camY, z: camZ }

  for (const win of WINDOWS) {
    if (win.roomId !== pano.id) continue
    const seg = windowFloorSegment(win)
    const top = windowTopM(win)
    const sill = win.sillM
    const yConst = Math.abs(seg.a.y - seg.b.y) < 1e-9
    const planeX = seg.a.x
    const planeY = seg.a.y
    const xMin = Math.min(seg.a.x, seg.b.x)
    const xMax = Math.max(seg.a.x, seg.b.x)
    const yMin = Math.min(seg.a.y, seg.b.y)
    const yMax = Math.max(seg.a.y, seg.b.y)

    // Pixel bounds from the corners' angular extents (expanded slightly).
    const corners = windowWorldCorners(win)
    const yp = corners.map((c) => worldPointToYawPitch(c, cameraPos, pano.orientation))
    const yawMin = Math.min(...yp.map((p) => p.yaw)) - 1.5
    const yawMax = Math.max(...yp.map((p) => p.yaw)) + 1.5
    const pitchMin = Math.min(...yp.map((p) => p.pitch)) - 1.5
    const pitchMax = Math.max(...yp.map((p) => p.pitch)) + 1.5
    const px0 = Math.max(0, Math.floor(((yawMin + 180) / 360) * WIDTH))
    const px1 = Math.min(WIDTH - 1, Math.ceil(((yawMax + 180) / 360) * WIDTH))
    const py0 = Math.max(0, Math.floor(((90 - pitchMax) / 180) * HEIGHT))
    const py1 = Math.min(HEIGHT - 1, Math.ceil(((90 - pitchMin) / 180) * HEIGHT))

    const FRAME = [248, 248, 245]
    const GLASS = [172, 202, 232]

    for (let py = py0; py <= py1; py++) {
      const pitch = 90 - ((py + 0.5) / HEIGHT) * 180
      const pitchRad = (pitch * Math.PI) / 180
      const cp = Math.cos(pitchRad)
      const dy = Math.sin(pitchRad)
      for (let px = px0; px <= px1; px++) {
        const yaw = ((px + 0.5) / WIDTH) * 360 - 180
        const worldYaw = yaw + pano.orientation
        const yawRad = (worldYaw * Math.PI) / 180
        const dx = cp * Math.cos(yawRad)
        const dz = cp * Math.sin(yawRad)

        let hitAlong
        let hitY
        if (yConst) {
          if (Math.abs(dz) < 1e-9) continue
          const t = (planeY - camZ) / dz
          if (t <= 0) continue
          const hitX = camX + t * dx
          hitY = camY + t * dy
          if (hitX < xMin - 1e-9 || hitX > xMax + 1e-9) continue
          if (hitY < sill - 1e-9 || hitY > top + 1e-9) continue
          hitAlong = (hitX - xMin) / (xMax - xMin || 1)
        } else {
          if (Math.abs(dx) < 1e-9) continue
          const t = (planeX - camX) / dx
          if (t <= 0) continue
          const hitZ = camZ + t * dz
          hitY = camY + t * dy
          if (hitZ < yMin - 1e-9 || hitZ > yMax + 1e-9) continue
          if (hitY < sill - 1e-9 || hitY > top + 1e-9) continue
          hitAlong = (hitZ - yMin) / (yMax - yMin || 1)
        }
        const v = (hitY - sill) / (top - sill || 1)
        const isFrame =
          hitAlong < 0.07 || hitAlong > 0.93 || v < 0.09 || v > 0.91
        const isMullion =
          (hitAlong > 0.475 && hitAlong < 0.525) || (v > 0.47 && v < 0.53)
        canvas.set(px, py, isFrame || isMullion ? FRAME : GLASS)
      }
    }
    console.log(
      `  window ${win.id}: yaw ${yp[0].yaw.toFixed(1)}..${yp[1].yaw.toFixed(1)} pitch ${pitchMin.toFixed(1)}..${pitchMax.toFixed(1)}`,
    )
  }
}

function paintPanorama(pano) {
  const canvas = makeCanvas()
  const theme = ROOM_THEME[pano.id]

  // Ceiling, wall and floor bands (yaw sweep makes rotation visible).
  canvas.fillBand(25, 90, theme.ceiling, { sweep: 0.05, vertical: 0.05 })
  canvas.fillBand(-30, 25, theme.wall, { sweep: 0.09 })
  canvas.fillBand(-90, -30, theme.floor, { sweep: 0.04, vertical: -0.04 })

  // Cornice + skirting strips at the band boundaries.
  canvas.fillYawRect(-180, 180, 24.5, 25, shade(theme.wall, 0.75))
  canvas.fillYawRect(-180, 180, -30.5, -30, shade(theme.wall, 0.55))
  canvas.fillYawRect(-180, 180, -30, -29.5, shade(theme.floor, 0.6))

  // Compass markers on ceiling (squares) and floor (diamonds).
  COMPASS_YAWS.forEach((yaw, i) => {
    const color = COMPASS_COLORS[i]
    const s = 14
    const cx = ((yaw + 180) / 360) * WIDTH
    canvas.fill(cx - s / 2, ((90 - 70) / 180) * HEIGHT - s / 2, cx + s / 2, ((90 - 70) / 180) * HEIGHT + s / 2, color)
    const fy = ((90 + 70) / 180) * HEIGHT
    for (let k = 0; k < s; k++) {
      const half = s / 2 * (1 - k / s)
      canvas.fill(cx - half, fy - s / 2 + k, cx + half, fy - s / 2 + k, color)
    }
  })

  // Room identity letter on a wall that is not a link direction.
  canvas.drawLetter(theme.letter, theme.letterYaw, 0, 30, shade(theme.wall, 1.35))

  // One doorway per outgoing link, at exactly the navigation arrow's yaw,
  // carrying the target room's letter.
  for (const link of LINKS) {
    if (link.from !== pano.id) continue
    const target = PANORAMAS.find((p) => p.id === link.to)
    const yaw = linkYaw(link)
    const targetTheme = ROOM_THEME[target.id]

    const doorHalf = 13
    const glow = shade(theme.wall, 1.18)
    canvas.fillYawRect(yaw - doorHalf - 3, yaw + doorHalf + 3, -29, 29, glow)
    canvas.fillYawRect(yaw - doorHalf - 2, yaw + doorHalf + 2, -28, 28, shade(theme.wall, 0.55))
    canvas.fillYawRect(yaw - doorHalf, yaw + doorHalf, -27, 27, [22, 22, 30])
    // Small threshold step under the doorway.
    canvas.fillYawRect(yaw - doorHalf, yaw + doorHalf, -33, -30, shade(theme.floor, 0.8))
    canvas.drawLetter(targetTheme.letter, yaw, 0, 12, targetTheme.wall)
  }

  // Real window (Phase 7): painted at its exact spatial direction so the
  // geometry-based overlay can be validated visually.
  paintWindows(canvas, pano)

  return encodePng(canvas)
}

// ------------------------------------------------------------------- main

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pano')
mkdirSync(outDir, { recursive: true })

for (const pano of PANORAMAS) {
  const png = paintPanorama(pano)
  const out = join(outDir, `${pano.id}.png`)
  writeFileSync(out, png)
  console.log(`wrote ${out} (${(png.length / 1024).toFixed(1)} KiB)`)
}

console.log('spatial arrangement:')
for (const pano of PANORAMAS) {
  for (const link of LINKS) {
    if (link.from !== pano.id) continue
    const target = PANORAMAS.find((p) => p.id === link.to)
    console.log(
      `  ${pano.label} (${pano.position.x},${pano.position.y}) -> ${target.label} (${target.position.x},${target.position.y})  yaw=${linkYaw(link).toFixed(1)} worldYaw=${worldYawBetween(pano, target).toFixed(1)}`,
    )
  }
}