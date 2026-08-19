# Instructor runbook

## Non-negotiable safety rules

- Use a dedicated lab owner/account and a disposable fork. Do not use a production organization.
- Use GitHub-hosted runners only. Never attach a self-hosted runner to this repository.
- `LAB_BOT_PAT` must be a powerless canary matching `BSIDESCLE-2026-CANARY-<random>-NO-PRIVILEGES`.
- Do not add any other repository secrets, environment secrets, or credentials.
- Do not broaden the workflow's `permissions` block or pass `github.token` to the script.
- The workflow is unrestricted: any fork PR can start it while the public repository is live.

## 1. Publish and configure the base repository

Create an empty public repository in the dedicated lab account, then push this repository only after reviewing the workflow and documentation.

In **Settings → Actions → General**:

- keep workflow permissions at read-only;
- do not allow Actions to create or approve pull requests;
- allow only GitHub-hosted runners.

Immediately before the exercise, create repository secret `LAB_BOT_PAT` with a new value in the required canary format. This must be a plain, nonfunctional string and not a token issued by any service.

At this point the lab is live for every GitHub user: opening a PR from any fork starts the vulnerable job automatically.

## 2. Prepare the participant fork

Follow `docs/PARTICIPANT.md` from a separate lab participant account. Confirm the PR changes only `.github/scripts/assign-reviewers.js` and contains the controlled fixture supplied by this repository.

Coordinate the exact opening time because there is no review step between PR creation and workflow execution. Review the participant branch in their fork before they open the PR.

## 3. Execute

The participant opens the prepared fork PR. That action alone triggers the repository workflow:

1. Verify that the run actor and fork owner are the expected participant before approving any platform-generated hold.
2. If GitHub's automatic malicious-workflow protection holds the public run, review and approve that platform-generated hold.
3. Watch the workflow check out the fork head and execute the changed script.
4. Download `pwn-request-proof-pr-<number>`.
5. Decode `capturedCanary` from `canary-proof.json` and compare it with the repository canary.

The proof demonstrates that a workflow definition from the trusted base branch automatically checked out and executed a script from the untrusted fork while the base repository secret was present.

## 4. Expected observations

- The workflow file is taken from the base branch because the event is `pull_request_target`.
- Checkout explicitly targets `pull_request.head.repo.full_name` and `pull_request.head.sha`.
- Current `actions/checkout` requires the visibly unsafe opt-out flag.
- The script path looks legitimate, but its contents come from the fork.
- GitHub log masking does not make the secret safe; the encoded canary is present in the artifact.
- No merge is required.
- The workflow itself defines no maintainer gate after PR creation; GitHub may independently hold a public run for approval.

## 5. Immediate cleanup

1. Delete repository secret `LAB_BOT_PAT`.
2. Close the PR.
3. Delete the workflow run/artifact.
4. Disable Actions or remove/rename the vulnerable workflow before leaving the repository public.
5. Delete the participant fork if it is no longer needed.
6. Review the repository's Actions runs and audit log for any unexpected activity.

Making the repository private is an additional containment step, not a substitute for disarming and removing the canary.

## 6. Presentation comparison

Show `secure-example/reviewer-workflow.yml` after the exploit. It retains `pull_request_target` only for metadata/API work and never checks out or executes PR content. For workflows that must execute the proposed change, use `pull_request` with no secrets and a read-only token.
