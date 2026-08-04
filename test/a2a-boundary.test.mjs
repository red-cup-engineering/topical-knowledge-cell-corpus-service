import assert from "node:assert/strict";
import test from "node:test";
import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { decodeSemantic, semanticBytes } from "@red-cup-engineering/relation-model-notation-cbor-codec";
import { executeA2aMessage } from "../scripts/execute-a2a-task.mjs";
import { corpusServiceProtocol } from "../src/protocol.mjs";

function message(operation) {
  const request = corpusServiceProtocol.encodeRequest(operation, {});
  return Message.toJSON({ messageId: "one", contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(semanticBytes(request.term))], metadata: {}, extensions: [], referenceTaskIds: [] });
}
function response(output) { return corpusServiceProtocol.decodeResponse(decodeSemantic(extractRmnPart(Message.fromJSON(output).parts).bytes)); }
test("corpus A2A face refuses before exact providers are activated", async () => {
  const result = response(await executeA2aMessage(message("form-corpus-reconciliation-intent"), async () => { throw new Error("corpus-service deployment is not activated"); }));
  assert.equal(result.disposition, "refused"); assert.match(result.reason, /not activated/u);
});
test("corpus A2A face refuses foreign operations before loading providers", async () => {
  let loaded = false;
  const result = response(await executeA2aMessage(message("discover-cells"), async () => { loaded = true; return {}; }));
  assert.equal(loaded, false); assert.match(result.reason, /unknown corpus-service operation/u);
});
