# Participant exercise

Use only the lab repository and participant account provided by the instructor.

## Prepare the fork PR

1. Fork the lab repository into the disposable participant account.
2. Create a branch named `pwn-request-demo`.
3. Replace `.github/scripts/assign-reviewers.js` with the contents of `attack-fixture/assign-reviewers.js`.
4. Commit the change and ask the instructor to verify the branch in your fork.
5. At the agreed time, open a PR against the lab repository's default branch. Opening it automatically starts the workflow.
6. Stop. Do not trigger unrelated workflows, inspect other runner data, add network exfiltration, or target any credential other than `LAB_BOT_PAT`.

No merge, label, or repository-defined maintainer gate is required after the PR is opened. GitHub may independently hold a public run under its automatic malicious-workflow protection.

## Verify the proof

After the approved run, download the artifact named `pwn-request-proof-pr-<number>`. Open `canary-proof.json` and Base64-decode `capturedCanary`.

The decoded value should begin with `BSIDESCLE-2026-CANARY-` and end with `-NO-PRIVILEGES`. Do not publish the artifact even though the value is intentionally powerless.

## Discussion questions

1. Which workflow file ran: the base version or the fork version?
2. Which copy of `assign-reviewers.js` ran?
3. Why did no merge need to occur?
4. Which control in the original incident would have broken the chain earliest?
5. Why is masking a value in logs not a security boundary?
