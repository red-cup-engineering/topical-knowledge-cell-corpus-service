import { createRelationalOperationProtocol } from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";

export const corpusServiceProtocol = createRelationalOperationProtocol({
  requestKind: "org.emsenn.topical-knowledge-cell-corpus-service.request.v1",
  responseKind: "org.emsenn.topical-knowledge-cell-corpus-service.response.v1",
  label: "corpus-service protocol",
});
export const encodeRequest = corpusServiceProtocol.encodeRequest;
export const decodeRequest = corpusServiceProtocol.decodeRequest;
export const encodeResponse = corpusServiceProtocol.encodeResponse;
export const decodeResponse = corpusServiceProtocol.decodeResponse;
