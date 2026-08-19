"use strict";

const fs = require("node:fs");
const path = require("node:path");

const eventPath = process.env.GITHUB_EVENT_PATH;
const labToken = process.env.LAB_BOT_PAT;

if (!labToken) {
  throw new Error("LAB_BOT_PAT is missing. Configure only a nonfunctional lab canary.");
}

let pullRequestNumber = "local";
if (eventPath && fs.existsSync(eventPath)) {
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  pullRequestNumber = event.pull_request?.number ?? pullRequestNumber;
}

const outputDirectory = path.join(process.cwd(), "lab-output");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "reviewer-assignment.json"),
  JSON.stringify(
    {
      pullRequestNumber,
      selectedReviewers: ["bsides-cleveland-lab-reviewer"],
      tokenWasAvailable: true,
      note: "Benign base script: the token value was not written or logged.",
    },
    null,
    2,
  ),
);

console.log(`Prepared a reviewer assignment plan for PR ${pullRequestNumber}.`);
