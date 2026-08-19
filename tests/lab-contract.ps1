$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$workflowPath = Join-Path $repoRoot ".github/workflows/pwn-request-lab.yml"
$fixturePath = Join-Path $repoRoot "attack-fixture/assign-reviewers.js"

$workflow = Get-Content -Raw $workflowPath
$fixture = Get-Content -Raw $fixturePath

$requirements = [ordered]@{
    "pull_request_target trigger" = $workflow.Contains("pull_request_target:")
    "automatic PR-open event" = $workflow.Contains("types: [opened]")
    "fork-only job condition" = $workflow.Contains("github.event.pull_request.head.repo.fork == true")
    "no participant allowlist" = -not $workflow.Contains("LAB_PARTICIPANT")
    "no maintainer label gate" = -not $workflow.Contains("run-pwn-request-lab")
    "no arming-variable gate" = -not $workflow.Contains("LAB_ARMED")
    "no environment approval gate" = -not $workflow.Contains("environment:")
    "fork repository checkout" = $workflow.Contains('repository: ${{ github.event.pull_request.head.repo.full_name }}')
    "fork head SHA checkout" = $workflow.Contains('ref: ${{ github.event.pull_request.head.sha }}')
    "current unsafe-checkout opt-out" = $workflow.Contains("allow-unsafe-pr-checkout: true")
    "checkout credentials not persisted" = $workflow.Contains("persist-credentials: false")
    "canary passed to PR-controlled script" = $workflow.Contains('LAB_BOT_PAT: ${{ secrets.LAB_BOT_PAT }}')
    "read-only workflow permissions" = $workflow.Contains("permissions:`n  contents: read")
    "artifact expires after one day" = $workflow.Contains("retention-days: 1")
    "fixture validates canary format" = $fixture.Contains("BSIDESCLE-2026-CANARY-") -and $fixture.Contains("-NO-PRIVILEGES")
    "fixture has no HTTP client" = -not ($fixture -match "https?://|fetch\(|http\.request|https\.request")
}

$failed = @($requirements.GetEnumerator() | Where-Object { -not $_.Value })
$requirements.GetEnumerator() | ForEach-Object {
    $status = if ($_.Value) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $($_.Key)"
}

if ($failed.Count -gt 0) {
    throw "$($failed.Count) lab contract assertion(s) failed."
}

Write-Host "All lab contract assertions passed."
