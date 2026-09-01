# GO/NO-GO Diagnostic Report — c658e915-9247-4904-8032-717dd11ecfdd.jpg

Generated: 2026-08-31
Fixture: `job-processor/src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json`
Image: `sample/c658e915-9247-4904-8032-717dd11ecfdd.jpg` (1500×1060)
Bounds: [195,130]–[1050,871] size 855×741
Scale: 50 ppm

> **Artifacts**: `job-processor/floorplan-verify.html` (3-panel verification), `job-processor/debug-source-overlay.html` (same overlay, source-visible), `diagnostic-advanced.mjs` + logs.

---

## 1. Source overlay — visual proof (Panel 1)

**File**: `job-processor/floorplan-verify.html` Panel 1 and `debug-source-overlay.html` — `viewBox 0 0 1500 1060` with image `data:image/jpeg` underneath, no crop/rotate. Red = wall thickness translucent + centerline, gray dashed = raw recognition polygons, blue/sand = rooms, yellow = exterior/terrace, blue/teal = door/window centerlines. Screenshot captured at http://localhost:8765/floorplan-verify.html (playwright, 2026-08-31).

Visual inspection at native resolution (see screenshot .playwright-mcp/page-2026-08-31T18-43-37-019Z.png):

### Exterior shell (thick black walls in source)

| Side | Source black stroke | Normalized geometry | Verdict |
|------|---------------------|----------------------|---------|
| Top wall (north) | Thick black horizontal along y≈130–152 from x≈195 to x≈1005, interrupted at door/window jambs | wall-2 (436,141)-(995,141) len 559 thick 22 covers centre; wall-7 (207,130)-(305,132) + wall-20 (306,150)-(207,153) cover north-west 100px but gap 130px between x306 and x436 (no wall). Screenshot: red top line has visible break at x~320–430 above kitchen top window (window-3 at 309-429). Gray dashed raw polygon-3 does bridge this gap (it spans 433–1050) but paired-side extraction truncated to 436–995. | **FAIL** — central gap 130px, north wall not continuous |
| Left wall (west) | Vertical black along x≈195–215 from y≈130 to y≈870, interrupted bottom at windows | wall-14 (207,153)-(206,860) len 706 thick 21.5 spans entire west edge. Overlaid red thick polygon aligns exactly to black stroke. wall-3 (206,860)-(282,860) bottom-west horizontal connects at corner (endpoint 0.0px). wall-20 connects at top. | **PASS** — left wall correct |
| Bottom wall (south) | Horizontal along y≈850–871 from x≈195 to x≈1004, with protruding stair well at x≈350–443 | wall-1 (602,856)-(1004,856) len 402 thick 27.7 spans south-east 602–1004 (good); wall-3 (206,860)-(282,860) spans south-west 206–282; gap 282–602 contains two tiny isolated walls wall-0 (377,846)-(408,846) len31 thick5.7 and wall-21 (441,870)-(381,871) len60 thick8 that are disconnected and do not bridge the gap. Distance wall-0 ↔ wall-21 = 25.1px, wall-3 ↔ wall-0 = unconnected, wall-1 ↔ wall-0 = 194px. Screenshot: bottom edge shows red south wall broken into 3 segments with white gaps at stair core. | **FAIL** — bottom shell fragmented into 4 isolated runs |
| Right wall (east) | Vertical black along x≈995–1010 from y≈130 to y≈870, with long window band y≈301–692 (window-2) and terrace door; piers between windows should still be wall | wall-13 (995,141)-(995,296) len155 covers north 141–296; wall-15 (1006,698)-(1004,856) len158 + wall-9 (985,703)-(987,856) len153 cover south 698–856 (doubled); **middle 296–698 (≈402px) has NO wall**. Raw polygon-1 spans 535–1050 with window notch but pairing left no middle pier. Window-2 centerline (994,301)-(994,692) occupies gap but no wall geometry remains. Screenshot: right edge red vertical has obvious missing segment mid-east, blue window line hangs in void. | **FAIL** — right shell missing 400px (≈8m) |

Overall exterior: **NOT closed**. Strict endpoint graph 18 components, advanced graph (endpoint+T+thick+intersect+collinear) still 10 components. Expected 1 exterior shell component. See §5.

### Interior walls

| Location | Source expectation | Normalized | Verdict |
|----------|-------------------|------------|---------|
| Kitchen/living separation (east wall of kitchen) | Horizontal wall y≈430–450 separating Küche from Wohnen, with door D at x≈376–432 | wall-4 (435,447)-(562,448) len127 thick8, wall-6 (268,441)-(370,442) len102 thick15.8, wall-19 (576,425)-(435,433) len141 thick8 — three collinear/h near y≈440 but gaps 65.7px (wall-6↔wall-4) and 14px (wall-4↔wall-19). Not connected, not reaching left exterior. Screenshot: red horizontals appear as discontinuous dashes across kitchen south edge. | FAIL |
| Hallway Windfang / Diele north boundary | Wall around y≈657–668 enclosing Flur + Diele | wall-5 (206,657)-(446,659) len240 + wall-22 (447,667)-(206,668) len241 — two parallel horizontals 10px apart, endpoint gap 9.9px. Classed as separate in strict graph, merged in advanced graph via thick+T but still overlapping/bending. Interior T-junction to wall-14 at x≈206 via thick overlap, but gap visible. wall-8 (403,667)-(405,748) + wall-17 (414,667)-(412,755) vertical partition between Windfang and Diel - gap 9px, isolated from horizontals (42px). | FAIL — fragmented into 4 walls, corner gaps |
| Bathroom (WC/Bad) boundaries | Enclosed room at south-west near Windfang, walls around 571–600 | wall-10 (571,557)-(571,848) len291 thick13 vertical — should separate Wohnen from Bad/Abstellraum but hangs free, endpoint 32.8px from wall-1, no connection to north wall. wall-16 (603,596)-(600,772) vertical 176px parallel 30px east of wall-10, gap 50.8px between them, isolated. wall-18 (774,827)-(536,852) diagonal 239px thick18 — cuts across Wohnen south-east diagonally, source shows straight bottom partition at y≈850, this diagonal is artifact of rawPolygon-1 L-shape pairing wrong opposite sides (thickness 27.7 vs 18). Screenshot: red diagonal wall-18 slants across model bottom, not matching any black stroke (source bottom wall is horizontal). | FAIL — three isolated verticals + diagonal artifact |
| Stair/core + upper horizontal | Small stair enclosure at y≈320–430 | wall-11 (505,327)-(505,429) len102 thick5 vertical, wall-19 already, wall-12 (510,141)-(510,222) len81 thick14 vertical under top wall — gaps 59–120px to neighbors, isolated. Screenshot: red verticals float inside Wohnen, no connection. | FAIL |
| Bottom-center stair well | Two tiny horizontals wall-0, wall-21 at y≈846–871 near stair graphic | Both isolated, thickness 5.7/8 too thin, length 31/60, not matching any architectural wall (source shows stair outline, not wall). Gray raw polygons there span 350–443 but pairing produced slats. | FAIL — non-architectural slats |

**Openings** (doors/windows) — centerlines visually correct: door-0 at (409,755)-(409,823) inside Windfang partition, door-1 (449,664)-(539,664) across hallway, door-2 (568,481)-(568,557) at mid, etc. Windows window-3 (309–429 top) and window-0 (288–384 bottom) align to black window gaps. window-2 (994,301–692) along missing right wall — correct placement but window hangs where wall is missing (so leaf floats). Entry door (447,864)-(530,864) at bottom stair well aligns.

**Summary visual overlay**: Red wall thickness polygons roughly overlay black strokes where walls exist, but stroke coverage is **patchy**: long continuous black strokes are broken into 2–3 red segments with white gaps of 10–400px. Several red segments (wall-18 diagonal, wall-0/21 slats) do not correspond to any black wall. Gray dashed raw polygons do trace black strokes more continuously (they enclose thick ribbons), indicating the raw recognition captured the architecture but the centerline pairing fragmented it.

---

## 2. Connectivity — endpoint-only vs architectural

Strict (endpoint 8px) graph (from `floorplan-verify.ts` STEP 4):
- 23 walls, **18 components**. Isolated singles: wall-0,4,6,7,8,9,10,11,12,16,17,18,19,21 (14 walls). Even top wall wall-2+13 is only 2-wall component, bottom wall-1+15 is 2-wall, etc. **No single exterior shell**.

Advanced architectural graph (endpoint ≤8 **OR** side T-junction ≤ thick/2+4 **OR** segment intersect **OR** thickness BB overlap **OR** collinear overlap, computed in `diagnostic-advanced.mjs`):
- Edges found (excerpt):
  - wall-1↔wall-9 T+intersect+thick (17px), wall-1↔wall-15 endpoint (0px), wall-1↔wall-18 T+thick (66px diagonal)
  - wall-2↔wall-13 endpoint, wall-2↔wall-12 T+intersect
  - wall-3↔wall-14 endpoint, wall-14↔wall-20 endpoint
  - wall-5↔wall-22 T+thick+collinear 9.9px, wall-5↔wall-14 T+intersect, wall-14↔wall-22 thick, etc.
  - wall-8↔wall-17 T+thick 9px, wall-8↔wall-22 thick, wall-17↔wall-22 intersect
  - wall-9↔wall-15 thick 19px, wall-11↔wall-19 T+intersect, wall-10↔wall-18 T+intersect
- Result: **10 components** (still fragmented):
  - C1 (7 walls): wall-3,14,22,17,8,20,5 — west + central hallway cluster
  - C2 (5 walls): wall-1,18,10,15,9 — south + right cluster (wall-18 diagonal spuriously joins)
  - C3 (3 walls): wall-2,13,12 — north cluster
  - C4 (2 walls): wall-11,19 — upper-mid
  - C5–C10 isolated: wall-0, wall-4, wall-6, wall-7, wall-16, wall-21

Interpretation: Even with generous side-touch (T-junction) and thickness overlap, **exterior remains split into three clusters (west, north, south-right) with no single closed shell**. Missing mid-right and top-gap prevent closure. Interior partitions remain 6 isolated groups.

Architectural requirement: **1 main component** encompassing exterior shell + interior partitions that touch it via T-junctions. Current: 10. Therefore exterior filtering/flood-fill will fail to separate interior from terrace.

---

## 3. Trace suspicious detached walls (isolated in 3D)

Every wall with component size 1 in strict graph = detached in 3D (model keeps 23 segments, each isolated wall becomes floating box). Advanced graph reduces but C5–C10 remain detached; C4 also detached from main.

| Wall ID | Raw polygon ID* | Raw poly bounds (px) | Normalized start → end (px) | Length (px) | Thickness (px) | Exterior flag | Location on source (visual) |
|---------|----------------|----------------------|-----------------------------|-------------|----------------|---------------|------------------------------|
| wall-0 | rawPoly 0 (350,823–443,871, 20pts) | [350,823]–[443,871] | (377,846)→(408,846) horizontal | 31 | 5.7 | false | Bottom-center stair well, small horizontal inside treppenhaus outline, not a wall |
| wall-4 | rawPoly 2 (435,322–577,477, 35pts) | [435,322]–[577,477] | (435,447)→(562,448) h |127|8.0|false|Mid-kitchen south edge, fragment of horizontal partition y≈447 |
| wall-6 | rawPoly 4 (195,130–449,870, 71pts) | [195,130]–[449,870] | (268,441)→(370,442) h |102|15.8|false|West-mid horizontal inside kitchen, 65px gap to wall-4 |
| wall-7 | rawPoly 4 | same | (207,130)→(305,132) h |98|18|false→true|Top-north west strip, gap 130px to wall-2, isolated |
| wall-8 | rawPoly 4 | same | (403,667)→(405,748) v |81|18|false|Vertical partition between Diel and Windfang, gap 9px to wall-17 |
| wall-9 | rawPoly 1 (535,557–1050,870, 81pts) | [536,557]–[1050,870] | (985,703)→(987,856) v |153|18|false|Right-south vertical, 19px from wall-15, missing mid-right |
| wall-10| rawPoly 1 | same | (571,557)→(571,848) v |291|13|false|Mid-vertical separating Wohnen/Bad, floating, 32px from south wall |
| wall-11| rawPoly 2 | same | (505,327)→(505,429) v |102|5|false|Upper-mid vertical inside Wohnen, thin, 59px gap |
| wall-12| rawPoly 3 (433,130–1050,298, 42pts) | [433,130]–[1050,298] | (510,141)→(510,222) v |81|14.4|false|Small vertical under north wall at x510, gap 74px |
| wall-16| rawPoly 1 | same | (603,596)→(600,772) v |176|18|false|Parallel to wall-10, 50px east, isolated |
| wall-17| rawPoly 4 | same | (414,667)→(412,755) v |88|18|false|Second vertical partition, 9px from wall-8 |
| wall-18| rawPoly 1 | same | (774,827)→(536,852) diagonal |239|18|false|South-east diagonal artifact, no source wall, derived from pairing opposite sides of L polygon (thickness 27) |
| wall-19| rawPoly 2 | same | (576,425)→(435,433) diagonal |141|8|false|North of wall-4, shallow diagonal, gap 14px |
| wall-21| rawPoly 0 | same as wall-0 | (441,870)→(381,871) h |60|8|true|Bottom stair well, 25px from wall-0, exterior flag true but isolated |

*Raw polygon ID by bounds: 0=small bottom,1=large bottom-right L,2=mid-small,3=top strip,4=left-large. Wall polygon stored equals cleaned raw polygon; mapping via midpoint-in-bounds (diagnostic-advanced.mjs).

All detached walls are visually at gaps described in §1 — they appear as floating red segments in Panel 3 (3D top-down) detached from dark exterior band.

---

## 4. Architectural wall components (grouping)

- **Exterior shell candidates** (should be 4 walls forming closed rectangle + south protrusion): wall-2 (north), wall-14 (west), wall-1 (south), wall-13/15/9 (east). Current grouping: **split into 3 advanced components** (C1 west, C3 north, C2 south-right) — not merged.
- **Interior partitions** (should be connected via T-junctions to shell): wall-4,5,6,8,10,11,16,17,19,22 etc. Current: C1 contains 5,8,17,22 (hallway) but wall-4,6,10,11,16,19 isolated.
- **Isolated / non-architectural geometry** (should be 0): wall-0, wall-21 (stair slats), wall-18 (diagonal artifact), plus the 4 isolated interiors above. Total 6 isolated singles + C4 (2-wall) = **8 non-architectural/fragmented pieces**.

No automatic merging was performed; components reported as computed.

---

## 5. Validation against recognition polygons

Raw recognition polygons (gray dashed in Panel 1):
- rawPoly-0 [350,823]–[443,871] (20pts) → walls wall-0 (31px) + wall-21 (60px). Polygon is small U-shape around stair graphic; normalized split into two thin slats covering opposite sides, but neither matches architectural wall (stair outline). **Both walls flagged as non-justified** (polygon ≠ architectural wall).
- rawPoly-1 [535,557]–[1050,870] (81pts) L-shape covering south + east + interior courtyard. Produced 7 walls: wall-1 (south, ok), wall-9/15 (east fragments, partial), wall-10,16 (mid verticals, ok but fragmented), wall-18 (diagonal artifact, **not justified** — pairs distant parallel sides 774↔536 with thickness 18 but angle not axis-aligned; source polygon corner at 774,829–786,829 is interior notch, not wall). Polygon area 22485px², but extraction truncated right wall mid-section.
- rawPoly-2 [435,322]–[577,477] (35pts) mid horizontal band. Produced wall-4,11,19 — all thin/short, polygon is recognition noise around door jambs; walls are fragments of partition but gap-ridden. Thicknesses 5–8px at lower limit, indicating uncertain pairing.
- rawPoly-3 [433,130]–[1050,298] (42pts) top strip. Produced wall-2 (559px, ok), wall-13 (155px, ok), wall-12 (81px, vertical stub) — wall-2 matches top black stroke, wall-13 matches east pier, wall-12 is spurious vertical inside Wohnen (no source wall). **wall-12 flagged**.
- rawPoly-4 [195,130]–[449,870] (71pts) left-large polygon covering west shell + interior. Produced 8 walls: wall-3,5,6,7,8,14,17,20,22 — wall-14 west shell correct, wall-3/20 corners correct, interior splits (5/22,8/17) are fragments of same wall line split by collinear cleanup gap 9–10px. **Wall-6 (268–370) isolated inside kitchen, wall-7 top strip isolated** — both derived from unpaired sides (UNPAIRED_MIN_LEN 60) with fallback thickness 18, not paired sides, thus less reliable.

Rule: Paired walls have thickness 13–27px (reliable), unpaired with fallback 18, thin 5–8px walls indicate failed pairing. Flagged unreliable: wall-0 (5.7), wall-4 (8), wall-11 (5), wall-19 (8), wall-21 (8), wall-12 (14.4 thin), wall-18 (diagonal), wall-6/7 (unpaired).

---

## 6. Room polygon validation (Panel 1 vs source)

| Room ID | Area | Translucent polygon location (Panel 1) | Source floor area | Verdict |
|---------|------|----------------------------------------|-------------------|---------|
| room-2 (Room 1, 105.3m²) | [523,162]–[977,832] | Large pink covering Wohnen + Diele + Flur eastern part, bounded by walls 2,14,10,18 etc. | Actual Wohnen ca 26m² + Flur etc combined — but polygon includes area south of wall-18 diagonal (which is artifact) and extends to x977 (right edge) while source terrace is at x1006–1050. Polygon leaks east across missing right wall gap (no wall to stop flood-fill). | **INCORRECT** — covers area that should be wall + terrace gap; eastern edge not bounded by exterior wall, leaks due to missing right wall. Dilate 10 + flood-fill + missing shell = leak. |
| room-1 (Kitchen, 25.8m²) | [229,162]–[493,423] | Sand covering Küche top-left + extends east to x493 (into Wohnen) | Source Küche ca 7.08m² labelled at top-left small room (219–403,156–376). Polygon 25.8m² is 3× too large, covering extra corridor that in source is Wohnen. Polygon includes wall-4/6 gaps. | **INCORRECT** — oversized, covers wall graphics and part of Wohnen |
| room-3 (Room 3, 22.2m²) | [228,459]–[554,649] | Blue covering Flur/Windfang mid | Source Diel ca 5.34m² + WC 3.47m² + Windfang 2.36m² combined? Actually source shows 3 small rooms there. Polygon lumps them into one 22.2m². Includes wall-10/16 area. | **INCORRECT** — merges multiple rooms, covers furniture symbols |
| room-5 (Room 4, 9.8m²) | [228,686]–[395,839] | Light green covering bottom-left small room (labeled Kitchen? actually south-west) | Source shows kitchen-like? Actually south-west is maybe kitchen alternative? Hard to map. Polygon overlaps wall-3 and stair graphic? It extends to y839 covering outside stair. | **INCORRECT** — shape includes stair exterior protrusion (source stair outside building) |
| room-4 (Room 5, 8.0m²) | [426,678]–[554,846] | Blue-green small room south-center near entry | Source Windfang 2.36m² + Abstellraum 2.51m²? Polygon merges. Location correct roughly but size mismatch. | PARTIAL — location plausible but area off |
| room-0 (OUT, 8.8m²) | [1016,126]–[1054,744] | Yellow sliver at extreme east edge, width 38px | Source Terrasse ca 15.06m² is large rectangle east of building from x~978 to x~1050, y~250–630 with table. Current polygon is narrow vertical strip x1016–1054 only, missing most terrace (the terrace free space not flooded because dilate 10 + wall gaps left terrace connected to outside? Actually outside region should be grid border, but terrace separated by missing wall, so flood-fill leaked interior into terrace and kept only sliver as exterior). | **INCORRECT** — covers only easternmost pier, not actual terrace |

Overall room detection: **ALL 6 polygons incorrect** by definition "covers wall/furniture/terrace/outside". The algorithm rasterizes raw wall polygons + dilate 10 + normalized walls, but because exterior shell broken (right gap), flood-fill from border leaks into Wohnen (room-2), causing room-2 to absorb terrace, and terrace shrinks to sliver. Kitchen/Flur merging due to partition gaps (wall-4/6 gaps, wall-10 isolation) allows rooms to merge.

Visual proof: Panel 1 room fills cross black wall strokes (e.g., pink room-2 crosses wall-10 vertical black stroke; blue room-3 crosses wall-8/17). Panel 2 (normalized 2D debugSvg) shows same — room polygons overlapping wall bands.

---

## 7. HTML inspection — 3 panels

- **Panel 1 SOURCE + OVERLAY**: All 23 wall centerlines labeled, thickness translucent red aligns to black strokes where present but with gaps as above. Room fills semi-transparent. Doors blue, windows teal positioned correctly on gaps. Image base64 visible underneath (no transform). Verified via playwright screenshot.
- **Panel 2 NORMALIZED 2D (debugSvg)**: Rendered via `renderDebugSvg(plan)` with translate(-165,901) flipped? ViewBox 0 0 915×801, shows walls as dark bands, rooms colored. Topology matches Panel 1 exactly — same fragmentation, same gaps. Indicates normalize→rooms pipeline consistent between SVG renderers.
- **Panel 3 3D TOP-DOWN (walls+floors orthographic)**: `buildFloorPlan3DModel` walls mapped back to pixel via `toM` invert (scale 50, center 622.5,500.5). Walls rendered as dark gray boxes with orange centerlines. Floors as pastel polygons. **Panels 3 vs 1 match**: every isolated red wall in Panel 1 appears as isolated dark box in Panel 3 at same pixel location (e.g., wall-10 vertical mid, wall-16 parallel, wall-18 diagonal). No additional gap introduced. 3D preserves 2D lengths (STEP 9/10 logs: len2d vs len3d OK within 0.001m, all heights 2.7m).

Thus **2D→3D mapping correct**, **3D wall dimensions correct** (thickness clamped min 0.15m, average 0.33m plausible), **GLB geometry** (pushBox) expected to extrude same boxes vertically — not inspected via GLB viewer screenshot but builder uses same `pushBox` with rotationY = atan2(dy,dx), validated via model walls.

Frontend rendering assumption: three.js viewer renders GLB as-is; no evidence of camera/render bug. Would need GLB screenshot comparison (not provided), but 3D top-down SVG already proves model matches normalized 2D. If screenshot earlier showed detached walls, it is due to model fragmentation, not viewer.

---

## 8. Critical decision table

| Stage | Correct? | Evidence |
|-------|----------|----------|
| Recognition | YES (partial) | Gray dashed raw polygons in Panel 1 trace black wall ribbons closely; 5 polygons cover exterior and partitions; raw bounds span required areas (195–1050, 130–871). Failures are small notches at openings, not gross miss. Logs: wall polygon areas 150+ kept, 5 kept. |
| Normalized walls | **NO** | Red centerlines/thickness gaps 10–400px; 18 strict /10 advanced components vs required 1; missing right wall 296–698 (≈8m), top gap 130px, bottom fragmented, interior isolated 8 walls, diagonal artifact wall-18, slats wall-0/21. Visual Panel 1/3. |
| Room polygons | **NO** | Room-2 leaks across missing right wall into terrace; room-1 25.8m² 3× source 7.08m²; room-3 merges Diel/WC/Windfang; room-0 terrace sliver 8.8m² vs 15.06m² actual; all rooms cross wall strokes (dilate+gap+broad shell break). Panel 1 translucent fills cross black lines. |
| 2D → 3D mapping | YES | STEP 9 logs: toM (p-cx)/scale, len2d vs len3d OK diff <0.05m for all walls; STEP 10 heights 2.7m; Panel 3 pixel positions invert exactly to Panel 1. No swap length/thickness. |
| 3D wall dimensions | YES | Thicknesses 0.15–0.55m avg0.33, lengths 0.6–14m match 2D/scale; no thickness>length swap warns; clamped to DEFAULT 0.15m reasonable. |
| GLB geometry | YES (by inspection) | `glb-builder.ts` pushBox uses length, thickness, height, rotationY = atan2(dy,dx) correctly; primitives per material, buffer assembly valid; no extra transform. Would extrude exactly model walls (validated via model). Not visually inspected but code correct. |
| Frontend rendering | YES (assumed) | Panel 3 orthographic proves model fragmented; viewer would render same detached boxes. No evidence of camera cut-off. If screenshot shows same detachment, renderer not at fault. Need actual GLB screenshot to confirm definitively, but pipeline evidence suggests renderer innocent. |

**FIRST INCORRECT STAGE = Normalized walls** (Phase 4 `normalize.ts` centerline reconstruction).

---

## 9. Final output

### First incorrect stage
**Normalized walls** — `job-processor/src/lib/floorplan-pipeline/normalize.ts:132-322` (clusterSides / runsFromPolygon / mergeRuns / snapWallCorners)

### Evidence
- Panel 1 source overlay: red wall thickness has 10–400px gaps on all four exterior sides and interior partitions; 23 walls form 18 strict /10 advanced components vs required 1; missing right wall mid-section 402px (y296–698) where black wall + window piers exist but no normalized wall.
- Diagnostic logs: wall-1↔wall-15 only south cluster, wall-2↔wall-13 only north, wall-14 west isolated from both; interior walls wall-4/6 gap65px, wall-10/16 gap51px, wall-8/17 gap9px, wall-0/21 slats 25px, wall-18 diagonal artifact.
- Room flood-fill leaked (room-2 pink extends to x977 across missing wall) and terrace collapsed to 38px sliver 8.8m², proving exterior not closed.
- 2D→3D mapping and GLB builder validated correct (length preserved, no thickness swap), so defect is upstream.

### Root cause
Paired-side wall extraction (`runsFromPolygon`) requires two parallel sides with overlap ≥12px, overlap ratio ≥0.4, thickness 4–30px. Recognition polygons are L/U-shaped ribbons with notches at openings; side clustering (SIDE_ANGLE_EPS 7°, OFFSET 5) fragments them, and the **best-pair scoring (thickness - overlap/1000)** incorrectly pairs distant sides across interior courtyard (e.g., south wall wall-18 diagonal) while **missing true opposite sides that are offset by door/window notches**. Unpaired fallback (UNPAIRED_MIN_LEN 60, thickness fallback 8–18) creates thin slats (wall-0,11 etc) and isolated horizontals. `snapWallCorners` (SNAP_GAP 28) closes T-junctions only at endpoints, not along wall sides, so T-junctions that meet side-mid (e.g., wall-10 to wall-1) remain open (distance 32px >28). `mergeRuns` (MERGE_GAP 32, OFFSET 6) merges only collinear runs with offset <6, but wall-4/6 offset ~15px so not merged. Result: fragmented centerlines, missing segments at window piers, spurious diagonal.

In short: **Current centerline reconstruction is unreliable** — it cannot robustly convert thick recognition polygons with opening notches into closed architectural centerlines. Heuristics (side clustering, pairing, merging, snapping, dilate 10) are insufficient for this floorplan topology.

### Recommended next implementation
Do NOT add another heuristic tweak. Reset to a topology-preserving approach:

1. **Exterior shell first**: Compute exterior contour from union of dilated wall polygons (MORPH close radius 12–15) → trace outer boundary (traceFreeRegionBoundary already exists) → simplify → split into orthogonal segments via Douglas-Peucker + removeCollinear. This guarantees closed shell.
2. **Interior partitions via skeleton/medial axis or Hough**: Instead of pairing polygon sides, rasterize walls to binary grid (as rooms does) and extract centerlines via thinning (Zhang-Suen) or via ridge detection, then vectorize with `simplifyPolygon` + `removeCollinear`. This naturally yields continuous centerlines that meet at T-junctions.
3. **Thickness from distance transform** at skeleton points, not paired side distance.
4. **Snap to exterior**: Project interior endpoints to nearest shell edge within 1.5× thickness, handling side-T automatically.
5. **Validate closure**: Assert wall graph has 1 exterior component and flood-fill separates terrace vs interior; fail pipeline if not, surface diagnostic instead of rendering detached 3D.

This re-architecture requires replacing `normalize.ts` runsFromPolygon logic, not another SNAP_GAP/MERGE_GAP tweak.

---

**GO / NO-GO Result**

**NO-GO: "Normalized geometry does not visually match the source."**

Wrong wall IDs: wall-0, wall-4, wall-6, wall-7, wall-8, wall-10, wall-11, wall-12, wall-16, wall-17, wall-18, wall-19, wall-21 (13 walls fragmented/isolated/non-architectural); plus missing segments: top gap between wall-20↔wall-2 (x306→436), right gap wall-13↔wall-15 (y296→698), bottom gap wall-3↔wall-0↔wall-21↔wall-1.

---

**Defect downstream statement**

> Normalized geometry is correct; the defect is downstream — **FALSE**.
> **Current centerline reconstruction is unreliable.**

2D→3D, GLB, frontend are correct; defect is at normalized walls stage.
