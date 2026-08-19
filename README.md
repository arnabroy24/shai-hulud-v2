# Shai-Hulud v2 pwn-request lab

This repository is a controlled reproduction of the GitHub Actions trust-boundary failure described in the Shai-Hulud v2/PostHog root-cause analysis. It is intended for the BSides Cleveland 2026 lab.

> [!CAUTION]
> This repository is intentionally vulnerable. Use only a dedicated lab account, GitHub-hosted runners, and the nonfunctional canary described below. Never configure a real PAT, npm token, cloud credential, deploy key, or production environment.

## What the lab reproduces

| Incident behavior | Lab equivalent |
| --- | --- |
| External contributor opens a fork PR | A participant opens a PR from a dedicated fork |
| `pull_request_target` runs in the base repository context | `.github/workflows/pwn-request-lab.yml` uses that event |
| Workflow explicitly checks out the PR head | Checkout uses the fork repository and `head.sha` |
| PR-controlled reviewer script is executed | Node runs `.github/scripts/assign-reviewers.js` from the fork |
| A broad bot PAT is present | A base-repository secret named `LAB_BOT_PAT` contains a powerless canary |
| Attacker sends the PAT away | The exercise fixture writes the encoded canary to a short-lived Actions artifact |

The lab intentionally stops there. It does not include the incident's organization-wide PAT, second-stage workflow tampering, npm token theft, package publication, malware, persistence, or arbitrary webhook exfiltration.

## Unrestricted public trigger

As in the incident, the vulnerable workflow starts automatically when any fork PR is opened. There is no participant allowlist, maintainer label, arming switch, or environment approval in the workflow.

While this repository is public and Actions is enabled, any GitHub user can attempt to invoke the job with attacker-controlled code. Keep the repository live only for the supervised demonstration window, configure no credential except the powerless canary, and disable the workflow immediately afterward.

## Repository layout

- `.github/workflows/pwn-request-lab.yml` — deliberately vulnerable workflow with an automatic PR-open trigger.
- `.github/scripts/assign-reviewers.js` — benign base-branch reviewer script.
- `attack-fixture/assign-reviewers.js` — controlled participant replacement that captures only the lab canary.
- `secure-example/reviewer-workflow.yml` — metadata-only corrected design for comparison.
- `docs/INSTRUCTOR.md` — setup, run, and cleanup procedure.
- `docs/PARTICIPANT.md` — fork/PR exercise steps.
- `tests/lab-contract.ps1` — static assertions for the intended workflow shape.

## Safety boundary

The canary should look like this:

```text
BSIDESCLE-2026-CANARY-<random-guid>-NO-PRIVILEGES
```

It must not be accepted by GitHub or any other service. `GITHUB_TOKEN` is not passed to the PR-controlled script, checkout credential persistence is disabled, workflow permissions are read-only, the artifact expires after one day, and only GitHub-hosted runners are used.

Start with [docs/INSTRUCTOR.md](docs/INSTRUCTOR.md). The source RCA is retained in `shai-hulud-v2-github-actions-root-cause-review.md`.

## Current GitHub behavior

GitHub added a checkout safeguard in 2026 that rejects common fork-head checkouts in `pull_request_target` workflows. This lab uses the deliberately conspicuous `allow-unsafe-pr-checkout: true` input so the historical flaw can still be demonstrated. That flag is part of the lesson, not a recommended production setting.

GitHub may also automatically hold a public-repository workflow it classifies as potentially malicious. That platform control is not configured by this repository and cannot be disabled here; if it activates, a write collaborator must approve the held run before the historical execution path continues.
