import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { OptionGroup } from "@elgato/utils";
import { JsonRpcRequest, JsonRpcResponse } from "@elgato/utils/rpc";

const require = createRequire(import.meta.url);
const utilsRequire = createRequire(require.resolve("@elgato/utils"));
const { z } = utilsRequire("zod/v4-mini");

test("the SDK's Zod rejects oversized collections before validating each item", () => {
  for (const kind of ["array", "set"]) {
    let visited = 0;
    const item = z.custom(() => {
      visited += 1;
      return false;
    });
    const schema =
      kind === "array" ? z.array(item).check(z.maxLength(2)) : z.set(item).check(z.maxSize(2));
    const items = Array.from({ length: 1_000 }, (_, i) => i);
    const result = schema.safeParse(kind === "array" ? items : new Set(items));
    assert.equal(result.success, false);
    assert.equal(visited, 0, `${kind} must reject the size before allocating per-item errors`);
    assert.equal(result.error.issues.length, 1);
  }
});

test("the patched Zod preserves the SDK's recursive options and JSON-RPC schemas", () => {
  const group = {
    type: "option-group",
    label: "Controls",
    options: [
      { type: "option", label: "Microphone", value: "microphone" },
      {
        type: "option-group",
        label: "Other",
        options: [{ type: "option", label: "Enabled", value: true }]
      }
    ]
  };
  assert.deepEqual(OptionGroup.parse(group), group);
  assert.equal(
    OptionGroup.safeParse({ ...group, options: [{ type: "option", value: {} }] }).success,
    false
  );
  for (const params of [{ enabled: true }, [true], undefined]) {
    const request = { jsonrpc: "2.0", method: "controls", params, id: "request-1" };
    assert.deepEqual(JsonRpcRequest.parse(request), request);
  }
  assert.equal(JsonRpcRequest.safeParse({ jsonrpc: "2.0", method: 1 }).success, false);
  for (const response of [
    { jsonrpc: "2.0", result: { enabled: true }, id: "request-1" },
    { jsonrpc: "2.0", error: { code: -32602, message: "Invalid params" }, id: "request-1" }
  ]) {
    assert.deepEqual(JsonRpcResponse.parse(response), response);
  }
  assert.equal(JsonRpcResponse.safeParse({ jsonrpc: "2.0", result: true }).success, false);
});
