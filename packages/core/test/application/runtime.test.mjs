import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeInfoService } from "@erp/core/application";

test("runtime use case delegates to its runtime configuration port", () => {
  const expected = { service: "ai-native-erp", profile: "local", data: "unconfigured" };
  let calls = 0;
  const service = new RuntimeInfoService({
    getRuntimeInfo() {
      calls += 1;
      return expected;
    },
  });
  assert.equal(service.getRuntimeInfo(), expected);
  assert.equal(calls, 1);
});
