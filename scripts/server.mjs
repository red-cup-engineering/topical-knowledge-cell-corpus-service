#!/usr/bin/env node
import { resolve } from "node:path";
import { serveContractedAgent } from "@red-cup-engineering/a2a-contracted-agent-service";
import { loadCorpusRuntime } from "../src/runtime.mjs";
const port = Number(process.env.PORT ?? 19838), host = process.env.HOST ?? "127.0.0.1";
const baseUrl = process.env.BASE_URL ?? `http://${host}:${port}`;
await loadCorpusRuntime();
serveContractedAgent({ port, host, baseUrl, agentCard: resolve("content/agent-cards/topical-knowledge-cell-corpus-service.json"), executor: process.execPath, executorArgs: [resolve("bin/execute-a2a-task.mjs")] })
  .then(() => process.stdout.write(`${baseUrl}\n`))
  .catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
