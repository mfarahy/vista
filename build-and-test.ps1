# Forward to the canonical script in scripts/
& (Join-Path $PSScriptRoot 'scripts\build-and-test.ps1') @args
