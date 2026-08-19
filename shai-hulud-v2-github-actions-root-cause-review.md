# Shai-Hulud v2: GitHub Actions Root-Cause Review

**Assessment date:** 2026-08-16  
**Incident window reviewed:** November 18–24, 2025  
**Verdict:** **Qualifies as a GitHub Actions–caused attack**  
**Confidence:** High

## Executive conclusion

Shai-Hulud v2 (also called **Sha1-Hulud: The Second Coming**) meets the strict test for a GitHub Actions attack surface: a badly designed, overprivileged GitHub Actions workflow was a documented initial-access path used to seed the npm supply-chain outbreak.

PostHog's first-party postmortem identifies the decisive chain. An external attacker changed a repository script in a fork and opened a pull request. A workflow triggered by `pull_request_target` explicitly checked out the pull request's head commit and executed that script in a privileged context. The run exposed a long-lived bot personal access token (PAT) with broad write permissions across the PostHog organization. The attacker then used that PAT to modify another workflow, collect additional GitHub Actions secrets—including an npm publishing token—and publish malicious PostHog packages. Those packages carried the self-replicating Shai-Hulud v2 payload.

This was not merely malware that happened to run in CI. The unsafe workflow was the initial privilege boundary failure that gave the attacker the credential used to reach package publication. PostHog explicitly describes itself as a directly targeted “patient zero,” and Wiz separately reports that abuse of `pull_request_target` through a pwn request was a confirmed initial-access vector for the incident.

There is an important scope caveat: not every later Shai-Hulud v2 victim was independently compromised through a vulnerable workflow. Many downstream victims installed an already-poisoned npm dependency on a workstation or CI runner. The GitHub Actions root-cause classification applies to the documented seeding of the campaign through PostHog (and similar direct targeting reported at other vendors), not to every secondary infection.

## The causation test

For this review, an incident qualifies only when an existing GitHub Actions workflow flaw or excessive workflow privilege enabled the initial foothold or the root compromise. Later use of Actions for persistence, execution, or exfiltration is insufficient on its own.

Shai-Hulud v2 passes because all of the following were present before the attacker held privileged credentials:

1. An attacker-controlled pull request automatically triggered a privileged workflow.
2. The workflow used `pull_request_target`, which executes in the base repository's security context.
3. It overrode the safe checkout behavior and fetched the attacker's PR-head code.
4. It executed a repository script taken from that untrusted checkout.
5. The execution context exposed a broadly scoped bot PAT.
6. Theft of that PAT enabled the next credential-theft stage and ultimately npm publication.

The combination—not `pull_request_target` alone—is the vulnerability. GitHub's own security guidance says that a privileged `pull_request_target` or `workflow_run` job must not check out and execute untrusted pull-request content. GitHub Security Lab has referred to this pattern as a **pwn request** since 2021.

## Incident reconstruction

### 1. The vulnerable workflow was introduced

PostHog maintained `auto-assign-reviewers.yaml` to assign reviewers based on the files changed in a pull request. The original `pull_request` trigger did not automatically run for external forks without approval, which frustrated the automation's purpose. On September 11, 2025, the workflow was changed to use `pull_request_target`, and its checkout was changed to the current PR head so the diff logic would work for external contributors.

The authors believed `pull_request_target` meant all code executed by the workflow would come from the trusted target branch. In reality, it guarantees that the *workflow definition* comes from the target repository; a later explicit checkout can still replace the worktree with attacker-controlled code. The workflow then ran `.github/scripts/assign-reviewers.js` from that worktree.

The dangerous data and trust flow was effectively:

```text
untrusted fork PR
    -> pull_request_target (privileged base-repository context)
    -> checkout PR head
    -> execute .github/scripts/assign-reviewers.js from PR head
    -> attacker code runs with access to a broad bot PAT
```

PostHog also disclosed that a static-analysis tool flagged the workflow change before it merged, but the alert was dismissed because both author and reviewer shared the same mistaken mental model. This is relevant to the root cause: the technical control detected the condition, but the review process treated the finding as a false positive.

### 2. Initial access: malicious PR and token theft

At approximately 17:40 on November 18, 2025, the now-deleted GitHub user `brwjbowkevj` opened a pull request against `PostHog/posthog`. The PR modified the reviewer-assignment script so that, when the workflow ran, available credentials were sent to an attacker-controlled webhook.

The PR was opened, caused the workflow to execute, and was closed within roughly one minute. No merge was required. The stolen secrets included a PostHog bot PAT with broad repository write access across the organization.

![PostHog GitHub audit log showing the attacker creating a pull request, triggering a workflow run, closing the pull request, and the workflow completing within approximately one minute](assets/incident-screenshots/shai-hulud-v2-initial-pr-logs.png)

*Figure 1 — PostHog's audit-log reconstruction of the initial malicious PR. The sequence shows `pull_request.create`, workflow creation, PR closure, and workflow completion under the attacker's identity in less than a minute. Source: [PostHog's first-party postmortem](https://posthog.com/blog/nov-24-shai-hulud-attack-post-mortem).*

This is the moment at which the attack crossed the trust boundary. The attacker began with only the ordinary ability of any GitHub user to submit a fork PR. The workflow converted that untrusted contribution into privileged code execution and credential access.

### 3. Privilege expansion through a second workflow

On November 23, the attacker tested whether the stolen bot credential remained valid by deleting a workflow run. Minutes later, the credential was used to push a detached commit that modified a `Lint PR` workflow to exfiltrate the other secrets available to GitHub Actions runners.

Because the stolen PAT had broad write permissions, this stage allowed arbitrary workflow modification without the normal PR review path. The attacker ran the modified workflow and deleted evidence of the run. GitHub audit logs later associated these actions with the compromised `posthog-bot` identity.

![PostHog GitHub audit log showing the compromised posthog-bot identity creating, completing, and deleting the follow-up workflow run](assets/incident-screenshots/shai-hulud-v2-follow-up-workflow.png)

*Figure 2 — The follow-up workflow activity attributed to the compromised `posthog-bot` identity. The create, complete, and delete sequence supports PostHog's finding that the stolen PAT was used to run a second credential-harvesting workflow and remove evidence afterward. Source: [PostHog's first-party postmortem](https://posthog.com/blog/nov-24-shai-hulud-attack-post-mortem).*

Among the secrets collected at this stage was an npm publishing token. The escalation chain was therefore:

```text
public PR capability
    -> privileged workflow RCE
    -> broad bot PAT
    -> direct workflow tampering
    -> GitHub Actions secret theft
    -> npm publishing token
```

### 4. Package publication and worm propagation

At 04:11 UTC on November 24, approximately twelve hours after the second-stage secret theft, malicious versions of PostHog packages were published to npm. PostHog listed affected releases including `posthog-node`, `posthog-js`, `posthog-react-native`, `@posthog/agent`, `@posthog/ai`, and `@posthog/cli`.

The packages used a `preinstall` script to run the Shai-Hulud v2 payload. The payload scanned its execution environment for credentials, created public GitHub repositories to exfiltrate the results, and used discovered npm credentials to poison more packages. This is how a targeted GitHub Actions compromise became a self-propagating ecosystem incident.

PostHog identified, removed, and began responding to the malicious packages by 09:30 UTC. Its report states that its own npm credential was not stolen by a prior worm infection: PostHog was targeted directly as a seed for the outbreak.

## Root-cause analysis

### Primary root cause: privileged execution of untrusted PR code

The primary design error was using `pull_request_target` together with an explicit PR-head checkout and subsequent execution of a script stored in the repository. Each part can be legitimate in isolation:

- `pull_request_target` is useful for metadata-only actions such as labeling or commenting on external PRs.
- Checking out a fork may be necessary for tests in an unprivileged `pull_request` workflow.
- Running a repository script is normal when the repository content is trusted.

Together, however, they turned attacker-controlled source into executable code inside a trusted job. The workflow erased the security isolation GitHub normally applies to pull requests from forks.

An equivalent unsafe pattern is:

```yaml
on: pull_request_target

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: node .github/scripts/assign-reviewers.js
```

The checkout itself is not code execution. The vulnerability is completed when a later step executes a build script, test, package lifecycle hook, local action, executable, or configuration controlled by the checked-out PR.

### Impact multiplier: an overprivileged, long-lived PAT

The reviewer-assignment task did not require broad write access across the organization. Yet its execution environment included a long-lived bot PAT with precisely that reach. Once stolen, the token let the attacker bypass the original constrained workflow and create a new secret-harvesting workflow.

This violated two least-privilege boundaries:

- **Capability:** the token could write broadly when the task only needed narrow reviewer-assignment functionality.
- **Scope and lifetime:** a reusable organization-wide PAT created a much larger blast radius than an ephemeral repository-scoped credential.

The workflow bug created initial code execution; the PAT converted it into organization-wide repository control.

### Control failure: a valid security alert was overridden

PostHog's static analysis detected the dangerous workflow change before it merged. The alert was dismissed based on an incorrect interpretation of `pull_request_target`. This shows why dangerous workflow combinations should be enforced as policy rather than left as advisory findings when privileged execution is possible.

### Release-credential exposure completed the supply-chain path

The second malicious workflow could access an npm token able to publish PostHog packages. A single CI identity therefore connected source-repository compromise to registry publication. Long-lived publishing credentials made it possible to save and reuse the capability hours later.

PostHog subsequently moved toward npm trusted publishing. OIDC-based trusted publication cannot eliminate a compromised release workflow, but it avoids a reusable npm token and can bind publication more tightly to a specific repository, workflow, environment, and branch.

## Why this is not merely “GitHub Actions was involved”

Shai-Hulud v2 also used GitHub Actions after infection: the malware attempted to register self-hosted runners and add workflow-based persistence. Those behaviors alone would not pass this review's causation test. The qualifying evidence is earlier and stronger:

- The attacker did not possess PostHog's bot or npm credentials before the malicious PR.
- The existing workflow automatically executed attacker-controlled code.
- That execution disclosed the first privileged credential.
- The stolen credential directly enabled the follow-on secret theft and malicious release.

GitHub Actions was therefore the initial exploit mechanism in the documented patient-zero chain, not just a convenient post-compromise tool.

## Security controls that would have broken the chain

### 1. Keep untrusted execution unprivileged

Use `pull_request` for builds, tests, formatting, or any other processing that executes fork-controlled content. For external forks, GitHub withholds repository secrets and gives the workflow a read-only token by default.

If a privileged follow-up must comment, label, or update the PR, separate it into a second workflow and pass only inert, validated results across the boundary. Treat artifacts produced by the untrusted workflow as untrusted data as well.

### 2. Make `pull_request_target` metadata-only

Where `pull_request_target` is necessary, do not check out the PR head and do not execute PR-controlled scripts, local actions, build definitions, tests, package installers, or configuration. Operate through the GitHub API on event metadata.

### 3. Remove broad PATs from general-purpose jobs

- Prefer the ephemeral `GITHUB_TOKEN` with an explicit minimal `permissions:` block.
- If a GitHub App is needed, request narrowly scoped, short-lived installation tokens for a limited repository set.
- Do not place organization-wide write credentials in jobs reachable from external events.
- Protect sensitive environment secrets with required reviewers and branch restrictions.

For a metadata-only reviewer-selection step, `contents: read` and narrowly scoped pull-request permissions should be the upper bound; arbitrary organization-wide repository writes should not be possible.

### 4. Isolate package publication

- Use npm trusted publishing/OIDC rather than a stored long-lived npm token.
- Restrict publication to a dedicated workflow on protected tags or branches.
- Require environment approval for release jobs.
- Keep publish jobs separate from PR jobs and from jobs that process untrusted artifacts.

### 5. Turn dangerous workflow findings into blocking policy

Block merges for combinations such as:

- `pull_request_target` plus checkout of `github.event.pull_request.head.*`
- privileged `workflow_run` jobs consuming and executing untrusted artifacts
- local script/action execution after an untrusted checkout
- secrets or broad PATs in workflows reachable from public events
- missing or write-heavy `permissions:` declarations

GitHub's CodeQL support for Actions and purpose-built workflow linters can detect many of these patterns, but the control must fail closed for high-confidence findings.

### 6. Add dependency defenses for secondary infections

These controls would not have fixed PostHog's initial pwn request, but they reduce worm propagation:

- enforce lockfiles and frozen installs in CI;
- disable package lifecycle scripts by default and allow only reviewed exceptions;
- apply a package minimum-release-age window;
- monitor CI egress and process behavior;
- use ephemeral runners and aggressively isolate secrets by job.

## Detection and investigation guidance

Organizations investigating exposure should correlate GitHub audit data, Actions metadata, npm logs, and endpoint/runner telemetry rather than relying only on the default branch history.

High-value signals include:

- external PRs that open, trigger a privileged workflow, and close within minutes;
- `pull_request_target` runs that check out a fork repository or PR-head SHA;
- outbound HTTP requests from reviewer, formatter, linter, or metadata workflows;
- deleted workflow runs or detached commits that modify `.github/workflows/`;
- actions performed by a bot identity from a new IP, user agent, or unusual time window;
- unexpected npm publications or token use after a GitHub Actions anomaly;
- Shai-Hulud v2 artifacts such as `setup_bun.js`, `bun_environment.js`, `cloud.json`, `contents.json`, `environment.json`, `truffleSecrets.json`, or `actionsSecrets.json`;
- unexpected self-hosted runner registrations, especially runners named `SHA1HULUD`;
- public GitHub repositories bearing the description `Sha1-Hulud: The Second Coming`.

Because the attacker deleted workflow evidence in the PostHog incident, GitHub organization audit logs and external SIEM retention are particularly important. Revocation must cover the entire credential chain: the initially exposed bot token, any secrets reachable with that token, registry credentials, cloud credentials present in later jobs, and credentials collected by infected packages.

## Limitations and confidence

The root-cause judgment is high confidence because it rests on PostHog's first-party incident investigation, including GitHub audit-log reconstruction, and is corroborated by independent security research. Exact ecosystem-wide victim counts varied rapidly during the outbreak and are intentionally not used to determine causation here.

The report does not claim that every organization affected by Shai-Hulud v2 had a vulnerable GitHub Actions workflow. Postman, Trigger.dev, Backstage, and many others describe downstream execution paths involving already-compromised dependencies. The conclusion is narrower: an unsafe GitHub Actions workflow was a confirmed initial-access vector used to obtain release credentials and seed a major part of the Shai-Hulud v2 campaign.

## Sources

1. [PostHog — Post-mortem of Shai-Hulud attack on November 24th, 2025](https://posthog.com/blog/nov-24-shai-hulud-attack-post-mortem) — first-party timeline and root-cause account.
2. [Wiz — Shai-Hulud 2.0 aftermath: trends, victimology and impact](https://www.wiz.io/blog/shai-hulud-2-0-aftermath-ongoing-supply-chain-attack) — independent confirmation of the pwn-request initial-access vector.
3. [Socket — Shai Hulud strikes again (v2)](https://socket.dev/blog/shai-hulud-strikes-again-v2) — malware analysis and summary of the PostHog initial-access finding.
4. [Postman — Root cause analysis: Shai-Hulud 2.0](https://blog.postman.com/engineering/root-cause-analysis-shai-halud-2-0/) — first-party example of downstream CI infection through a compromised dependency, missing lockfile, and exposed npm token.
5. [Trigger.dev — How we got hit by Shai-Hulud: a complete post-mortem](https://trigger.dev/blog/shai-hulud-postmortem) — first-party downstream victim account and hardening measures.
6. [GitHub Security Lab — Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/) — authoritative explanation of the vulnerable trigger/checkout combination.
7. [GitHub Docs — Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — current guidance for untrusted code, token permissions, expression handling, and action pinning.
8. [GitHub Docs — Script injections](https://docs.github.com/en/actions/concepts/security/script-injections) — authoritative treatment of attacker-controlled context values.
