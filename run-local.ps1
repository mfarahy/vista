# Forward to the canonical script in scripts/
# Usage: ./run-local.ps1 [same args as ./scripts/run-local.ps1]
& (Join-Path $PSScriptRoot 'scripts\run-local.ps1') @args
