#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { executeRelationalOperationMessage } from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";
import { formCorpusReconciliationIntent } from "../lib/corpus.mjs";
import { corpusServiceProtocol } from "../src/protocol.mjs";
import { loadCorpusRuntime } from "../src/runtime.mjs";

const operations = Object.freeze({
  "form-corpus-reconciliation-intent": (input, runtime) =>
    formCorpusReconciliationIntent(input, runtime.providers, runtime.options),
});
export function executeA2aMessage(source, runtimeLoader = loadCorpusRuntime) {
  return executeRelationalOperationMessage(source, {
    protocol: corpusServiceProtocol,
    operations,
    runtimeLoader,
    responseFilename: "topical-corpus-service-response.rmn.cbor",
    unknownOperationMessage: "unknown corpus-service operation",
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(await executeA2aMessage(JSON.parse(readFileSync(0, "utf8"))))}\n`); }
  catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
}
