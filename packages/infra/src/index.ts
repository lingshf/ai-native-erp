import type { RuntimeInfo, RuntimeInfoPort } from "@erp/core/application";

export interface RuntimeEnvironment {
  readonly ERP_PROFILE?: string;
  readonly ERP_HOST?: string;
  readonly ERP_PORT?: string;
}

export interface RuntimeConfiguration {
  readonly profile: "local";
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
}

export class RuntimeConfigurationError extends Error {
  constructor() {
    super("Invalid Local runtime configuration");
    this.name = "RuntimeConfigurationError";
  }
}

export function parseRuntimeConfiguration(
  environment: RuntimeEnvironment = {},
  options: { readonly allowPortZero?: boolean } = {},
): RuntimeConfiguration {
  const profile = environment.ERP_PROFILE === undefined ? "local" : environment.ERP_PROFILE;
  const host = environment.ERP_HOST === undefined ? "127.0.0.1" : environment.ERP_HOST;
  const text = environment.ERP_PORT === undefined ? "4180" : environment.ERP_PORT;
  if (
    profile !== "local" ||
    (host !== "127.0.0.1" && host !== "::1") ||
    typeof text !== "string" ||
    !/^[0-9]+$/.test(text)
  ) {
    throw new RuntimeConfigurationError();
  }
  const port = Number(text);
  if (
    !Number.isSafeInteger(port) ||
    port < (options.allowPortZero === true ? 0 : 1) ||
    port > 65535 ||
    port === 4173
  ) {
    throw new RuntimeConfigurationError();
  }
  return Object.freeze({ profile, host, port });
}

export class LocalRuntimeInfo implements RuntimeInfoPort {
  private readonly configuration: RuntimeConfiguration;

  constructor(configuration: RuntimeConfiguration) {
    this.configuration = parseRuntimeConfiguration(
      {
        ERP_PROFILE: configuration.profile,
        ERP_HOST: configuration.host,
        ERP_PORT: String(configuration.port),
      },
      { allowPortZero: true },
    );
  }

  getRuntimeInfo(): RuntimeInfo {
    return {
      service: "ai-native-erp",
      profile: this.configuration.profile,
      data: "unconfigured",
    };
  }
}
