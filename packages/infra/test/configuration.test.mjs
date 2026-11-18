import assert from "node:assert/strict";
import test from "node:test";
import { LocalRuntimeInfo, parseRuntimeConfiguration, RuntimeConfigurationError } from "@erp/infra";

test("explicit configuration defaults and Local runtime info", () => {
  const config = parseRuntimeConfiguration({});
  assert.deepEqual(config, { profile: "local", host: "127.0.0.1", port: 4180 });
  assert.deepEqual(new LocalRuntimeInfo(config).getRuntimeInfo(), {
    service: "ai-native-erp",
    profile: "local",
    data: "unconfigured",
  });
  assert.equal(parseRuntimeConfiguration({ ERP_HOST: "::1", ERP_PORT: "65535" }).host, "::1");
  assert.equal(parseRuntimeConfiguration({ ERP_PORT: "1" }).port, 1);
  assert.equal(
    parseRuntimeConfiguration({ PORT: "4173", HOST: "0.0.0.0", DATA_DIR: "unused" }).port,
    4180,
  );
});

test("unsafe and malformed explicit configuration is rejected without echoing input", () => {
  for (const environment of [
    ...["server", "", "LOCAL", "unknown"].map((ERP_PROFILE) => ({ ERP_PROFILE })),
    ...["", "localhost", "0.0.0.0", "::", "127.0.0.2", " 127.0.0.1"].map((ERP_HOST) => ({
      ERP_HOST,
    })),
    ...[
      "",
      "0",
      "4173",
      "-1",
      "+1",
      "1.0",
      "1e3",
      " 4180",
      "4180 ",
      "65536",
      "9".repeat(400),
      null,
      4180,
    ].map((ERP_PORT) => ({ ERP_PORT })),
  ]) {
    assert.throws(
      () => parseRuntimeConfiguration(environment),
      (error) => error instanceof RuntimeConfigurationError && !error.message.includes("65536"),
    );
  }
  assert.equal(parseRuntimeConfiguration({ ERP_PORT: "0" }, { allowPortZero: true }).port, 0);
});
