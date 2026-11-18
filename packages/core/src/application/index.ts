export * from './storage.ts';
export type * from './legacy-teaching.ts';
export * from './legacy-query.ts';
export { DomainError } from '@erp/core/domain';

export interface RuntimeInfo {
  readonly service: 'ai-native-erp';
  readonly profile: 'local';
  readonly data: 'unconfigured';
}

export interface RuntimeInfoPort {
  getRuntimeInfo(): RuntimeInfo;
}

export class RuntimeInfoService {
  private readonly runtime: RuntimeInfoPort;
  constructor(runtime: RuntimeInfoPort) { this.runtime = runtime; }

  getRuntimeInfo(): RuntimeInfo {
    return this.runtime.getRuntimeInfo();
  }
}
