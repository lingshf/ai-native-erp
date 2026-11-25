import { afterEach, describe, expect, it, vi } from "vitest";
import { CopilotClient, type CopilotClientOptions } from "@github/copilot-sdk";
import { copilotRuntimeEnv, isolatedClient } from "../src/copilot-ai-client.ts";
import type { CopilotTextRuntime } from "../src/copilot-ai.ts";

// Fictitious values only: these tests never read real credentials or start the SDK runtime.
const fakeToken = "fake-copilot-token-for-tests";
const excludedHostEnv = {
  Ai_Api_Key: "fake-ai-key",
  ai_base_url: "http://fake.invalid",
  Copilot_Cli_Path: "/fake/copilot",
  GH_TOKEN: "fake-gh-token",
  GITHUB_TOKEN: "fake-github-token",
  ERP_SQLITE_FILE: "/fake/erp.sqlite",
  UNRELATED_SERVICE_SECRET: "fake-unrelated-secret",
  PATH: "/fake/bin",
};

function factoryOptions(): CopilotClientOptions {
  let received: CopilotClientOptions | undefined;
  isolatedClient("/fake/dir", {
    clientFactory: (options) => {
      received = options;
      return {} as CopilotTextRuntime;
    },
  });
  if (!received) throw new Error("factory was not called");
  return received;
}

function stubHostEnv(token: string | undefined) {
  for (const [key, value] of Object.entries(excludedHostEnv)) vi.stubEnv(key, value);
  vi.stubEnv("COPILOT_GITHUB_TOKEN", token);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SDK factory env allowlist (SEC-02)", () => {
  it("passes only an explicitly set COPILOT_GITHUB_TOKEN, with exact key and value", () => {
    stubHostEnv(fakeToken);
    expect(factoryOptions().env).toStrictEqual({ COPILOT_GITHUB_TOKEN: fakeToken });
  });

  it("passes an explicit empty object when COPILOT_GITHUB_TOKEN is not set", () => {
    stubHostEnv(undefined);
    expect(factoryOptions().env).toStrictEqual({});
  });

  it("treats an empty COPILOT_GITHUB_TOKEN as not set", () => {
    stubHostEnv("");
    expect(factoryOptions().env).toStrictEqual({});
  });
});

describe("COPILOT_GITHUB_TOKEN name matching", () => {
  it("accepts any casing on Windows and forwards it under the canonical name", () => {
    const source = { ...excludedHostEnv, copilot_github_token: fakeToken };
    expect(copilotRuntimeEnv(source, "win32")).toStrictEqual({ COPILOT_GITHUB_TOKEN: fakeToken });
  });

  it("prefers the exact name on Windows when several casings are present", () => {
    const source = { Copilot_GitHub_Token: "other-fake", COPILOT_GITHUB_TOKEN: fakeToken };
    expect(copilotRuntimeEnv(source, "win32")).toStrictEqual({ COPILOT_GITHUB_TOKEN: fakeToken });
  });

  it("is case-sensitive on other platforms", () => {
    const source = { ...excludedHostEnv, copilot_github_token: fakeToken };
    expect(copilotRuntimeEnv(source, "linux")).toStrictEqual({});
    expect(copilotRuntimeEnv({ COPILOT_GITHUB_TOKEN: fakeToken }, "linux")).toStrictEqual({
      COPILOT_GITHUB_TOKEN: fakeToken,
    });
  });
});

describe("SDK transport", () => {
  it("pins stdio even when the host asks for another default connection", () => {
    stubHostEnv(undefined);
    vi.stubEnv("COPILOT_SDK_DEFAULT_CONNECTION", "inprocess");
    const options = factoryOptions();
    // toEqual: the SDK factory fills unset path/args/env with undefined (bundled runtime, client env).
    expect(options.connection).toEqual({ kind: "stdio" });
    // The real SDK rejects env with an in-process transport; constructing (not starting) proves
    // the pinned connection overrides the host default.
    expect(() => new CopilotClient(options)).not.toThrow();
  });
});
