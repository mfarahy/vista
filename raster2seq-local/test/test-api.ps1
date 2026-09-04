# End-to-end test for the raster2seq-local API (Windows PowerShell 5.1 compatible).
# Usage:
#   $env:RASTER2SEQ_MOCK = "true"; node ..\api\server.js   # terminal 1
#   .\test-api.ps1                                          # terminal 2
# Or mock the server inline: .\test-api.ps1 -StartServer -Mock true
param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$StartServer,
  [string]$Mock = "true"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$serverProc = $null

function Assert-JsonCode($body, $expectedCode) {
  $json = $body | ConvertFrom-Json
  if ($json.success -ne $false -or $json.error.code -ne $expectedCode) {
    throw "Expected error code $expectedCode, got: $body"
  }
  Write-Host "[OK] error code $expectedCode" -ForegroundColor Green
  return $json
}

try {
  if ($StartServer) {
    Write-Host "Starting API server (MOCK=$Mock)..." -ForegroundColor Yellow
    $env:RASTER2SEQ_MOCK = $Mock
    $serverProc = Start-Process -FilePath "node" -ArgumentList "server.js" `
      -WorkingDirectory (Join-Path $root "api") -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 3
  }

  # 1. Health check
  Write-Host "`n[1/10] GET /api/health" -ForegroundColor Cyan
  $health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 10
  Write-Host ($health | ConvertTo-Json -Compress)

  # 2. Valid floorplan upload
  Write-Host "`n[2/10] POST valid image" -ForegroundColor Cyan
  $sample = Join-Path $root "samples\floorplan-multiroom.png"
  $validBody = curl.exe -s -X POST "$BaseUrl/api/floorplan/analyze" -F "image=@$sample"
  $valid = $validBody | ConvertFrom-Json
  if ($valid.success -ne $true) { throw "Expected success, got: $validBody" }
  $rooms = $valid.result.room_count
  Write-Host "[OK] success, room_count=$rooms" -ForegroundColor Green
  $first = $valid.result.spaces[0]
  Write-Host ("First space: " + ($first | ConvertTo-Json -Compress))

  # 3. Missing image
  Write-Host "`n[3/10] POST without image" -ForegroundColor Cyan
  $missingBody = curl.exe -s -X POST "$BaseUrl/api/floorplan/analyze"
  Assert-JsonCode $missingBody "MISSING_IMAGE" | Out-Null

  # 4. Invalid file (text content, image mime)
  Write-Host "`n[4/10] POST invalid image bytes" -ForegroundColor Cyan
  $fake = Join-Path $env:TEMP "r2s-fake-test.png"
  "not an image" | Set-Content -LiteralPath $fake -NoNewline
  $invalidBody = curl.exe -s -X POST "$BaseUrl/api/floorplan/analyze" `
    -F "image=@$fake;type=image/png"
  Assert-JsonCode $invalidBody "INVALID_IMAGE" | Out-Null
  Remove-Item -LiteralPath $fake -Force -ErrorAction SilentlyContinue

  # 5. Unexpected field name
  Write-Host "`n[5/10] POST wrong field name" -ForegroundColor Cyan
  $wrongFieldBody = curl.exe -s -X POST "$BaseUrl/api/floorplan/analyze" -F "photo=@$sample"
  Assert-JsonCode $wrongFieldBody "MISSING_IMAGE" | Out-Null

  # 6. Temp cleanup: the service stages uploads only in its own TMP_DIR
  # (default $env:TEMP\raster2seq-local); nothing may remain there.
  Write-Host "`n[6/10] temp cleanup" -ForegroundColor Cyan
  $stageDir = if ($env:TMP_DIR) { $env:TMP_DIR } else { Join-Path $env:TEMP "raster2seq-local" }
  $leftovers = @()
  if (Test-Path -LiteralPath $stageDir) {
    $leftovers = @(Get-ChildItem -LiteralPath $stageDir -ErrorAction SilentlyContinue)
  }
  if ($leftovers.Count -gt 0) { throw "Temp files left behind: $($leftovers.FullName)" }
  Write-Host "[OK] staging dir clean ($stageDir)" -ForegroundColor Green

  # 7. Mock VLM refinement contract (?refine=vlm, no API key needed in mock)
  Write-Host "`n[7/10] POST ?refine=vlm (mock)" -ForegroundColor Cyan
  $refineBody = curl.exe -s -X POST "$BaseUrl/api/floorplan/analyze?refine=vlm" -F "image=@$sample"
  $refined = $refineBody | ConvertFrom-Json
  if ($refined.success -ne $true) { throw "Expected success, got: $refineBody" }
  if ($refined.result.refinement -ne 'vlm' -or $refined.result.stage -ne 'draft+vlm') {
    throw "Expected refinement=vlm/stage=draft+vlm, got: $refineBody"
  }
  if (-not $refined.result.refined_spaces -or $refined.result.refined_room_count -lt 1) {
    throw "Expected refined_spaces, got: $refineBody"
  }
  $rs = $refined.result.refined_spaces[0]
  if (-not $rs.id -or -not $rs.room_type -or -not $rs.polygon) { throw "Bad refined space: $($rs | ConvertTo-Json -Compress)" }
  Write-Host ("[OK] refined_room_count=" + $refined.result.refined_room_count) -ForegroundColor Green

  # 8. RunPod-compatible alias (what expose-service calls: field `file`,
  # raw body with status/spaces, no {success,result} envelope)
  Write-Host "`n[8/10] POST /predict?refine=vlm (mock)" -ForegroundColor Cyan
  $predictBody = curl.exe -s -X POST "$BaseUrl/predict?refine=vlm" -F "file=@$sample"
  $predict = $predictBody | ConvertFrom-Json
  if ($predict.status -ne 'ok') { throw "Expected status ok, got: $predictBody" }
  if ($predict.success) { throw "Alias must not wrap the body: $predictBody" }
  if (-not $predict.spaces -or -not $predict.refined_spaces) { throw "Missing spaces: $predictBody" }
  Write-Host ("[OK] unwrapped ok, spaces=" + $predict.spaces.Count) -ForegroundColor Green

  # 9. Alias draft (no refine flag)
  Write-Host "`n[9/10] POST /predict draft (mock)" -ForegroundColor Cyan
  $predictDraftBody = curl.exe -s -X POST "$BaseUrl/predict" -F "file=@$sample"
  $predictDraft = $predictDraftBody | ConvertFrom-Json
  if ($predictDraft.status -ne 'ok' -or -not $predictDraft.spaces) { throw "Bad draft alias: $predictDraftBody" }
  Write-Host "[OK] draft alias ok" -ForegroundColor Green

  # 10. Missing-key guard (no server needed; exercises the real guard)
  Write-Host "`n[10/10] refine without OPENAI_API_KEY" -ForegroundColor Cyan
  $guardScript = "import('./lib/vlm-refine.js').then(async (m) => { try { await m.refineFloorplan({ imageBuffer: Buffer.alloc(10), mimeType: 'image/png', draft: { spaces: [] }, requestId: 'test' }); console.log('CODE:NONE'); } catch (e) { console.log('CODE:' + e.code); } })"
  Push-Location (Join-Path $root 'api')
  try {
    $guardOut = cmd /c ('set OPENAI_API_KEY= && node --input-type=module -e "' + $guardScript + '"') 2>&1
  } finally {
    Pop-Location
  }
  if (-not ($guardOut -match 'CODE:VLM_NOT_CONFIGURED')) { throw "Expected VLM_NOT_CONFIGURED, got: $guardOut" }
  Write-Host "[OK] VLM_NOT_CONFIGURED without key" -ForegroundColor Green

  Write-Host "`n=== ALL TESTS PASSED ===" -ForegroundColor Cyan
} finally {
  if ($serverProc) {
    Write-Host "Stopping API server..." -ForegroundColor Yellow
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
  }
}
