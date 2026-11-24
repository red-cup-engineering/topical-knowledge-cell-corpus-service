import { resolve } from "node:path";
import { loadBoundRuntime } from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";

const ROOT = resolve(import.meta.dirname, "..");
export function loadCorpusRuntime(boundaryPath = process.env.TOPICAL_CORPUS_BOUNDARY
  ?? resolve(ROOT, "content/deployment/runtime-boundary.json")) {
  return loadBoundRuntime({
    boundaryPath,
    boundaryType: "DeploymentBoundary",
    factoryExport: "createTopicalKnowledgeCellCorpusRuntime",
    root: ROOT,
    inactiveMessage: "corpus-service deployment is not activated",
  });
}
