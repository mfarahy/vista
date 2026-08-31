# MeltFlex Support Email — Floor Plan to 3D API Issue

---

**To:** support@meltflexai.com
**Subject:** 502 "3D conversion failed, fetch failed" on /api/v1/floorplan-to-3d with valid JPEG floor plans
**Priority:** High

---

Dear MeltFlex Support Team,

We are integrating the **MeltFlex Floor Plan to 3D API** into our real estate exposé platform (Vista) and encountering a consistent **502 Bad Gateway** error on the `/api/v1/floorplan-to-3d` endpoint. The API key is valid (no 401 errors), but every conversion attempt fails with the same error.

## API Details

- **Endpoint:** `POST https://www.meltflexai.com/api/v1/floorplan-to-3d`
- **Authentication:** `Authorization: Bearer <API_KEY>` — confirmed working (returns 401 with invalid key)
- **API Key format:** `mf_sk_...` (54 characters)
- **Response format we expect:** GLB 3D model (either via `modelUrl` or `model` base64 fallback)

## Error Observed

Every request returns:

```json
HTTP/1.1 502 Bad Gateway
Content-Type: application/json; charset=utf-8

{
  "error": "3D conversion failed",
  "details": "fetch failed"
}
```

**Consistent across:**
- Multiple floor plan images (JPEG, 59KB–128KB)
- Both `image` (base64 data URL) and `imageUrl` (public URL) delivery methods
- Response time: ~50 seconds per request (suggests the conversion process starts but fails internally)

## Test Results

| Test | Payload | Result | Duration |
|------|---------|--------|----------|
| Base64 data URL (128KB JPEG floor plan) | `{"image": "data:image/jpeg;base64,..."}` | **502** "3D conversion failed, fetch failed" | 53,413ms |
| Base64 data URL (59KB JPEG floor plan) | `{"image": "data:image/jpeg;base64,..."}` | **502** "3D conversion failed, fetch failed" | 49,154ms |
| Base64 data URL with format: "glb" | `{"image": "data:image/jpeg;base64,...", "format": "glb"}` | **502** "3D conversion failed, fetch failed" | 50,898ms |
| imageUrl (publicly hosted JPEG) | `{"imageUrl": "https://...floorplan.jpg"}` | **502** "3D conversion failed, fetch failed" | 49,062ms |
| Tiny 1x1 white PNG (70 bytes) | `{"image": "data:image/png;base64,iVBOR..."}` | **500** "Failed to process floorplan" | 3,401ms |
| Raw base64 without data: prefix | `{"image": "base64string..."}` | **400** "Invalid image format. Expected data:image/...;base64,..." | 1,925ms |
| Wikipedia image URL (SVG→PNG) | `{"imageUrl": "https://upload.wikimedia.org/..."}` | **400** "Failed to fetch image from imageUrl" | 1,690ms |

## What We Verified

1. **API key is valid** — no 401 errors; authentication succeeds
2. **Request format is correct** — raw base64 without `data:` prefix returns 400 confirming MeltFlex expects the data URL format
3. **Images are valid JPEG floor plans** — standard architectural 2D floor plans (German "Grundriss"), properly encoded, 59KB–128KB
4. **Images are accessible** — tested both inline base64 and publicly hosted URLs; MeltFlex receives them (no 400 for format issues with correct payload)
5. **502 is not a timeout** — responses come back in ~50 seconds, not immediately; the conversion process starts but fails internally
6. **"fetch failed" detail** — this appears in the `details` field of the 502 response, suggesting an internal fetch/processing step fails during conversion

## Image Characteristics

Our floor plans are:
- **Format:** JPEG (.jpg)
- **Size:** 59KB–128KB
- **Content:** Standard 2D architectural floor plans with walls, rooms, doors, windows, furniture outlines, room labels in German
- **Resolution:** Typical real estate floor plan dimensions (suitable for web display)
- **Encoding:** Standard JPEG, verified via magic bytes (`ff d8 ff`)

## Our Integration Details

- **Client:** Node.js (v26) `fetch` API with `AbortSignal.timeout(180000)` (3-minute timeout)
- **Payload:** `{ "image": "data:image/jpeg;base64,<base64_encoded_image>" }`
- **Headers:** `Authorization: Bearer <key>`, `Content-Type: application/json`
- **No proxy/CDN interference** — direct HTTPS connection to `www.meltflexai.com`

## Questions

1. Is there a **minimum image resolution** or **maximum file size** requirement for floor plan images?
2. Does the API expect a **specific type** of floor plan (e.g., clean vector-style vs. scanned/photo)?
3. Are there any **additional parameters** required beyond `image` or `imageUrl`?
4. Is the `floorplan-to-3d` endpoint currently experiencing **service issues** or **capacity constraints**?
5. Could the "fetch failed" detail indicate an issue with **our image content** (e.g., specific floor plan style not supported)?
6. Do you have a **test image** we can use to verify our integration is correct?

## Request

We would appreciate:
- Confirmation that the API is operational
- Guidance on image requirements (format, resolution, content expectations)
- A working test case or sample payload if available
- Any error logs from your side showing the internal failure cause

We are happy to provide additional debugging information, including full request/response dumps, image files for testing, or any other details you need.

Thank you for your assistance.

Best regards,
[Vista Development Team]
