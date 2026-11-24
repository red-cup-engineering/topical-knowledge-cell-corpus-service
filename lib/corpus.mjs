const ACTOR = "urn:ame:topical-knowledge-cell-corpus-service";
const SCOPES = new Set(["enterprise", "state", "nation", "colony", "union", "public"]);
const DISCLOSURES = new Set(["public", "customer-confidential", "provider-private"]);
export const FORBIDDEN_EFFECTS = Object.freeze([
  "notebook-created", "notebook-mutated", "source-uploaded", "source-deleted",
  "sharing-changed", "publication-performed", "report-generated",
  "payment-settled", "customer-territory-mutated",
]);

function fail(message) { throw new TypeError(message); }
function text(value, name) { if (typeof value !== "string" || value.trim() === "") fail(`${name} must be exact and nonempty`); return value; }
function instant(value, name) { text(value, name); if (!Number.isFinite(Date.parse(value))) fail(`${name} must be an exact instant`); return value; }
function exactKeys(value, required, optional = []) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail("one plain record is required");
  const admitted = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
  for (const key of Object.keys(value)) if (!admitted.has(key)) fail(`unexpected ${key}`);
}
function sortUnique(values, name) {
  if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || v === "")) fail(`${name} must be a string sequence`);
  const result = [...values].sort(); if (new Set(result).size !== result.length) fail(`${name} contains duplicates`); return result;
}
function source(value) {
  exactKeys(value, ["sourceId", "mediaType", "contentDigest", "provenanceIds", "disclosureClass"], ["replacesSourceDigest"]);
  text(value.sourceId, "sourceId"); text(value.mediaType, "mediaType");
  if (!/^sha256:[0-9a-f]{64}$/u.test(value.contentDigest)) fail("contentDigest must be exact sha256");
  if (!DISCLOSURES.has(value.disclosureClass)) fail("unknown disclosureClass");
  const normalized = { ...value, provenanceIds: sortUnique(value.provenanceIds, "provenanceIds") };
  if (Object.hasOwn(value, "replacesSourceDigest") && !/^sha256:[0-9a-f]{64}$/u.test(value.replacesSourceDigest)) fail("replacement digest must be exact sha256");
  return normalized;
}
function definition(value) {
  exactKeys(value, ["type", "cellId", "ownerEnterprise", "topic", "scopeKind", "authorityMode", "disclosurePolicy", "sourceSet", "notebookCustodyAssignment", "createdAt"]);
  if (value.type !== "TopicalKnowledgeCellDefinition") fail("wrong cell definition type");
  for (const key of ["cellId", "ownerEnterprise", "topic", "notebookCustodyAssignment"]) text(value[key], key);
  if (!SCOPES.has(value.scopeKind)) fail("unknown scopeKind");
  if (value.authorityMode !== "non-authoritative-projection") fail("central or authoritative views are refused");
  exactKeys(value.disclosurePolicy, ["id", "digest", "maximumDisclosure"]); text(value.disclosurePolicy.id, "disclosure policy id");
  if (!/^sha256:[0-9a-f]{64}$/u.test(value.disclosurePolicy.digest)) fail("disclosure policy digest must be exact");
  if (!DISCLOSURES.has(value.disclosurePolicy.maximumDisclosure)) fail("unknown maximumDisclosure");
  instant(value.createdAt, "createdAt");
  const sourceSet = value.sourceSet.map(source), identities = new Set();
  for (const item of sourceSet) { if (identities.has(item.sourceId)) fail("duplicate source identity"); identities.add(item.sourceId); }
  return { ...value, sourceSet: sourceSet.sort((a, b) => a.sourceId.localeCompare(b.sourceId)) };
}
function disclosureAllowed(item, policy) {
  const rank = { public: 0, "customer-confidential": 1, "provider-private": 2 };
  return rank[item.disclosureClass] <= rank[policy.maximumDisclosure];
}
function observed(value, cell) {
  exactKeys(value, ["notebookId", "observedAt", "sourceReceipts"]); text(value.notebookId, "notebookId"); instant(value.observedAt, "observedAt");
  if (!Array.isArray(value.sourceReceipts)) fail("sourceReceipts must be a sequence");
  const receipts = value.sourceReceipts.map((receipt) => {
    exactKeys(receipt, ["receiptId", "notebookId", "cellId", "sourceId", "contentDigest", "status"]);
    if (receipt.notebookId !== value.notebookId || receipt.cellId !== cell.cellId) fail("observed receipt is not bound to notebook and cell");
    if (receipt.status !== "ready") fail("only ready source receipts are comparable");
    return source({ sourceId: receipt.sourceId, mediaType: "application/octet-stream", contentDigest: receipt.contentDigest, provenanceIds: [receipt.receiptId], disclosureClass: "provider-private" });
  });
  if (new Set(receipts.map((r) => r.sourceId)).size !== receipts.length) fail("duplicate observed source identity");
  return { ...value, sourceReceipts: receipts.sort((a, b) => a.sourceId.localeCompare(b.sourceId)) };
}

export async function formCorpusReconciliationIntent(request, providers, options = {}) {
  exactKeys(request, ["type", "requestId", "actor", "cellDefinition", "observedNotebookState", "desiredSourceSetId", "authorization", "intendedNotebookProvider"]);
  if (request.type !== "TopicalKnowledgeCellReconciliationRequest") fail("wrong request type");
  text(request.requestId, "requestId"); text(request.actor, "actor"); text(request.intendedNotebookProvider, "intendedNotebookProvider");
  if (!providers || typeof providers.identify !== "function" || typeof providers.lookupRequest !== "function" || typeof providers.record !== "function") fail("contracted identity and WitnessJournal providers are required");
  const cell = definition(request.cellDefinition), observation = observed(request.observedNotebookState, cell), now = options.now ?? new Date().toISOString();
  const desiredIdentity = await providers.identify({ type: "TopicalKnowledgeCellSourceSet", cellId: cell.cellId, sources: cell.sourceSet });
  if (request.desiredSourceSetId !== desiredIdentity.id) fail("desired source-set identity does not match RMN identity provider");
  const requestBodyIdentity = await providers.identify({
    type: request.type, requestId: request.requestId, actor: request.actor,
    cellDefinition: request.cellDefinition, observedNotebookState: request.observedNotebookState,
    desiredSourceSetId: request.desiredSourceSetId, intendedNotebookProvider: request.intendedNotebookProvider,
  });
  const auth = request.authorization; exactKeys(auth, ["holder", "cellId", "allowedOperation", "requestId", "requestBodyId", "expiresAt", "nondelegable", "singleUse"]);
  if (auth.holder !== request.actor || auth.cellId !== cell.cellId || auth.requestId !== request.requestId || auth.allowedOperation !== "reconcile-corpus-intent") fail("authorization is not bound to actor, cell, request, and operation");
  if (auth.requestBodyId !== requestBodyIdentity.id) fail("authorization is not bound to the exact request body");
  if (auth.nondelegable !== true || auth.singleUse !== true) fail("authorization must be nondelegable and single-use");
  if (cell.ownerEnterprise !== request.actor) fail("only the owning enterprise may request reconciliation");
  if (cell.sourceSet.some((item) => !disclosureAllowed(item, cell.disclosurePolicy))) fail("source disclosure exceeds the cell policy");
  const requestIdentity = await providers.identify(request), incumbent = await providers.lookupRequest(request.requestId);
  if (incumbent && incumbent.requestIdentity !== requestIdentity.id) fail("request identity collision");
  if (incumbent) return incumbent.intent;
  if (Date.parse(instant(auth.expiresAt, "authorization expiry")) <= Date.parse(now)) fail("authorization has expired");
  const desired = new Map(cell.sourceSet.map((item) => [item.sourceId, item])), current = new Map(observation.sourceReceipts.map((item) => [item.sourceId, item]));
  const add = [], preserve = [], remove = [];
  for (const [sourceId, item] of desired) {
    const prior = current.get(sourceId);
    if (!prior) add.push(sourceId);
    else if (prior.contentDigest === item.contentDigest) preserve.push(sourceId);
    else if (item.replacesSourceDigest === prior.contentDigest) { add.push(sourceId); remove.push(sourceId); }
    else fail("changed digest under a stable source identity requires an explicit replacement relation");
  }
  for (const sourceId of current.keys()) if (!desired.has(sourceId)) remove.push(sourceId);
  const body = {
    type: "TopicalKnowledgeCellReconciliationIntent", version: 1, provider: ACTOR,
    request: requestIdentity.id, requestId: request.requestId, cell: cell.cellId,
    ownerEnterprise: cell.ownerEnterprise, authorityMode: cell.authorityMode,
    notebookCustodyAssignment: cell.notebookCustodyAssignment, notebookId: observation.notebookId,
    intendedNotebookProvider: request.intendedNotebookProvider, before: await providers.identify({ type: "ObservedSourceSet", cellId: cell.cellId, sources: observation.sourceReceipts }),
    after: desiredIdentity, add: add.sort(), preserve: preserve.sort(), remove: remove.sort(),
    disclosureVerdict: "within-declared-policy", providerRequestTerms: { operation: "reconcile-notebook-sources", authorityRequiredFromOwner: true, execute: false },
    receiptBindings: observation.sourceReceipts.map((item) => item.provenanceIds[0]).sort(),
    forbiddenEffects: Object.fromEntries(FORBIDDEN_EFFECTS.map((effect) => [effect, false])), formedAt: now,
  };
  const identity = await providers.identify(body), intent = Object.freeze({ id: identity.id, ...body });
  await providers.record({ type: "TopicalKnowledgeCellReconciliationReceipt", actor: ACTOR, requestIdentity: requestIdentity.id, requestId: request.requestId, intent, identityEvidence: identity.evidence ?? null, recordedAt: now });
  return intent;
}
