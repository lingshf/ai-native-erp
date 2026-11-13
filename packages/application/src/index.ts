export * from './storage.js';
export type * from './legacy-teaching.js';
export * from './legacy-query.js';
export { DomainError } from '@erp/domain';

export interface RuntimeInfo {
  readonly service: 'ai-native-erp';
  readonly profile: 'local';
  readonly data: 'unconfigured';
}

export interface RuntimeInfoPort {
  getRuntimeInfo(): RuntimeInfo;
}

export class RuntimeInfoService {
  constructor(private readonly runtime: RuntimeInfoPort) {}

  getRuntimeInfo(): RuntimeInfo {
    return this.runtime.getRuntimeInfo();
  }
}
