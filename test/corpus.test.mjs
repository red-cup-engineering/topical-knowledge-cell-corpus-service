import assert from "node:assert/strict";
import test from "node:test";
import { makeNiUri } from "@red-cup-engineering/ni-uri-services-section";
import { FORBIDDEN_EFFECTS, formCorpusReconciliationIntent } from "../lib/corpus.mjs";

function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function identity(value) { return { id: makeNiUri(Buffer.from(stable(value), "utf8")), evidence: "urn:test:rmn-provider-receipt" }; }
function harness() {
  const records = new Map(); return { records, providers: {
    identify: async (value) => identity(value), lookupRequest: async (id) => records.get(id) ?? null,
    record: async (receipt) => { records.set(receipt.requestId, { requestIdentity: receipt.requestIdentity, intent: receipt.intent }); },
  }};
}
const D1 = `sha256:${"1".repeat(64)}`, D2 = `sha256:${"2".repeat(64)}`, POLICY = `sha256:${"a".repeat(64)}`;
function request(overrides = {}) {
  const cellDefinition = { type: "TopicalKnowledgeCellDefinition", cellId: "urn:cell:rendanheyi", ownerEnterprise: "urn:ame:rendanheyi-cell-owner", topic: "Rendanheyi management", scopeKind: "public", authorityMode: "non-authoritative-projection", disclosurePolicy: { id: "urn:policy:public", digest: POLICY, maximumDisclosure: "public" }, sourceSet: [{ sourceId: "urn:source:one", mediaType: "text/html", contentDigest: D1, provenanceIds: ["urn:prov:one"], disclosureClass: "public" }], notebookCustodyAssignment: "urn:custody:rendanheyi", createdAt: "2026-07-23T03:00:00.000Z" };
  const value = { type: "TopicalKnowledgeCellReconciliationRequest", requestId: "urn:request:one", actor: cellDefinition.ownerEnterprise, cellDefinition, observedNotebookState: { notebookId: "notebook-one", observedAt: "2026-07-23T03:30:00.000Z", sourceReceipts: [] }, desiredSourceSetId: identity({ type: "TopicalKnowledgeCellSourceSet", cellId: cellDefinition.cellId, sources: cellDefinition.sourceSet }).id, authorization: null, intendedNotebookProvider: "urn:ame:notebooklm-inference-team" };
  const result = { ...value, ...overrides };
  const requestBodyId = identity({ type: result.type, requestId: result.requestId, actor: result.actor, cellDefinition: result.cellDefinition, observedNotebookState: result.observedNotebookState, desiredSourceSetId: result.desiredSourceSetId, intendedNotebookProvider: result.intendedNotebookProvider }).id;
  result.authorization = Object.hasOwn(overrides, "authorization") ? overrides.authorization : { holder: result.actor, cellId: result.cellDefinition.cellId, allowedOperation: "reconcile-corpus-intent", requestId: result.requestId, requestBodyId, expiresAt: "2026-07-24T03:00:00.000Z", nondelegable: true, singleUse: true };
  return result;
}
function rebind(value) { value.authorization.requestBodyId = identity({ type: value.type, requestId: value.requestId, actor: value.actor, cellDefinition: value.cellDefinition, observedNotebookState: value.observedNotebookState, desiredSourceSetId: value.desiredSourceSetId, intendedNotebookProvider: value.intendedNotebookProvider }).id; return value; }
const NOW = { now: "2026-07-23T04:00:00.000Z" };

test("forms one projection-safe add intent with every forbidden effect false", async () => {
  const h = harness(), result = await formCorpusReconciliationIntent(request(), h.providers, NOW);
  assert.deepEqual(result.add, ["urn:source:one"]); assert.equal(result.authorityMode, "non-authoritative-projection");
  assert.deepEqual(Object.keys(result.forbiddenEffects), [...FORBIDDEN_EFFECTS]); assert.ok(Object.values(result.forbiddenEffects).every((value) => value === false)); assert.equal(h.records.size, 1);
});
test("exact replay returns the same identity while request-id collision refuses", async () => {
  const h = harness(), first = await formCorpusReconciliationIntent(request(), h.providers, NOW), second = await formCorpusReconciliationIntent(request(), h.providers, NOW); assert.equal(second.id, first.id);
  await assert.rejects(formCorpusReconciliationIntent(request({ intendedNotebookProvider: "urn:ame:changed" }), h.providers, NOW), /collision/u);
  const replay = await formCorpusReconciliationIntent(request(), h.providers, { now: "2026-07-25T04:00:00.000Z" }); assert.equal(replay.id, first.id);
});
test("authority mismatch, delegation, reuse, and expiry refuse", async () => {
  for (const authorization of [
    { ...request().authorization, holder: "urn:ame:delegate" }, { ...request().authorization, nondelegable: false },
    { ...request().authorization, singleUse: false }, { ...request().authorization, expiresAt: "2026-07-23T03:59:59.000Z" },
  ]) await assert.rejects(formCorpusReconciliationIntent(request({ authorization }), harness().providers, NOW));
  await assert.rejects(formCorpusReconciliationIntent(request({ authorization: { ...request().authorization, requestBodyId: "ni:///sha-256;changed" } }), harness().providers, NOW), /exact request body/u);
});
test("authoritative projection and disclosure violation refuse", async () => {
  const central = request(); central.cellDefinition = { ...central.cellDefinition, authorityMode: "authoritative" };
  await assert.rejects(formCorpusReconciliationIntent(central, harness().providers, NOW), /authoritative views/u);
  const secret = request(); secret.cellDefinition = { ...secret.cellDefinition, sourceSet: [{ ...secret.cellDefinition.sourceSet[0], disclosureClass: "customer-confidential" }] }; secret.desiredSourceSetId = identity({ type: "TopicalKnowledgeCellSourceSet", cellId: secret.cellDefinition.cellId, sources: secret.cellDefinition.sourceSet }).id;
  rebind(secret); await assert.rejects(formCorpusReconciliationIntent(secret, harness().providers, NOW), /disclosure/u);
});
test("silent digest replacement and foreign receipt binding refuse", async () => {
  const changed = request(); changed.observedNotebookState.sourceReceipts = [{ receiptId: "urn:receipt:old", notebookId: "notebook-one", cellId: changed.cellDefinition.cellId, sourceId: "urn:source:one", contentDigest: D2, status: "ready" }];
  rebind(changed); await assert.rejects(formCorpusReconciliationIntent(changed, harness().providers, NOW), /replacement relation/u);
  const foreign = request(); foreign.observedNotebookState.sourceReceipts = [{ receiptId: "urn:receipt:foreign", notebookId: "notebook-two", cellId: foreign.cellDefinition.cellId, sourceId: "urn:source:one", contentDigest: D1, status: "ready" }];
  rebind(foreign); await assert.rejects(formCorpusReconciliationIntent(foreign, harness().providers, NOW), /bound to notebook/u);
});
test("an explicit digest replacement schedules both old removal and new addition", async () => {
  const value = request(); value.observedNotebookState.sourceReceipts = [{ receiptId: "urn:receipt:old", notebookId: "notebook-one", cellId: value.cellDefinition.cellId, sourceId: "urn:source:one", contentDigest: D2, status: "ready" }];
  value.cellDefinition.sourceSet[0].replacesSourceDigest = D2;
  value.desiredSourceSetId = identity({ type: "TopicalKnowledgeCellSourceSet", cellId: value.cellDefinition.cellId, sources: value.cellDefinition.sourceSet }).id;
  rebind(value);
  const result = await formCorpusReconciliationIntent(value, harness().providers, NOW); assert.deepEqual(result.add, ["urn:source:one"]); assert.deepEqual(result.remove, ["urn:source:one"]);
});
