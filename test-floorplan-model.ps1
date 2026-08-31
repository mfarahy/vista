# Test script for floorplan-recognition model
# Usage: .\test-floorplan-model.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== Floorplan Recognition Model Test ===" -ForegroundColor Cyan

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "[OK] Docker is running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Stop and remove any existing container
$existing = docker ps -a -q -f "ancestor=r8.im/ton731/floorplan-recognition@sha256:6d9285b49483724cfa20294f80f711ca32fc1c488bb98ca01f0499651d966773"
if ($existing) {
    Write-Host "Stopping existing container..." -ForegroundColor Yellow
    docker stop $existing | Out-Null
    docker rm $existing | Out-Null
}

# Start the container
Write-Host "Starting floorplan-recognition container..." -ForegroundColor Yellow
docker run -d -p 5000:5000 r8.im/ton731/floorplan-recognition@sha256:6d9285b49483724cfa20294f80f711ca32fc1c488bb98ca01f0499651d966773 | Out-Null

# Wait for container to be ready
Write-Host "Waiting for container to start (30s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check if container is running
$containerStatus = docker ps -f "ancestor=r8.im/ton731/floorplan-recognition@sha256:6d9285b49483724cfa20294f80f711ca32fc1c488bb98ca01f0499651d966773" --format "{{.Status}}"
if (-not $containerStatus) {
    Write-Host "[ERROR] Container is not running!" -ForegroundColor Red
    docker ps -a | Where-Object { $_ -like "*floorplan*" }
    exit 1
}
Write-Host "[OK] Container is running: $containerStatus" -ForegroundColor Green

# Test the API with sample image
Write-Host "`nSending test request..." -ForegroundColor Yellow
$testImage = "https://replicate.delivery/pbxt/OcXvPD6NQxXXMgMQIwVIqQLNwiIJB8SVN4MLh7raQqBbtpEn/4.jpg"

$body = @{
    input = @{
        image = $testImage
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/predictions" `
                                  -Method POST `
                                  -ContentType "application/json" `
                                  -Body $body `
                                  -TimeoutSec 120

    Write-Host "[OK] API Response received!" -ForegroundColor Green
    Write-Host "`nResponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10

    # Check status
    if ($response.status -eq "succeeded") {
        Write-Host "`n[SUCCESS] Model prediction completed!" -ForegroundColor Green
        if ($response.output) {
            Write-Host "`nOutput:" -ForegroundColor Cyan
            $response.output
        }
    } elseif ($response.status -eq "processing" -or $response.status -eq "starting") {
        Write-Host "`n[INFO] Model is still processing. Checking again in 10s..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        $response2 = Invoke-RestMethod -Uri "http://localhost:5000/predictions/$($response.id)" -Method GET -TimeoutSec 120
        $response2 | ConvertTo-Json -Depth 10
    } else {
        Write-Host "`n[WARNING] Status: $($response.status)" -ForegroundColor Yellow
        if ($response.error) {
            Write-Host "Error: $($response.error)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "[ERROR] API request failed: $_" -ForegroundColor Red
    Write-Host "`nChecking container logs..." -ForegroundColor Yellow
    $containerId = docker ps -q -f "ancestor=r8.im/ton731/floorplan-recognition@sha256:6d9285b49483724cfa20294f80f711ca32fc1c488bb98ca01f0499651d966773"
    if ($containerId) {
        docker logs $containerId --tail 50
    }
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
Write-Host "Container is still running on port 5000. To stop it:" -ForegroundColor Yellow
Write-Host '  docker stop $(docker ps -q -f "ancestor=r8.im/ton731/floorplan-recognition")' -ForegroundColor Gray
