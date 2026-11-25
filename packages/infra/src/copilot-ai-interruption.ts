import { AiFailure, type AiFailureReason } from "@erp/core/application";

export interface CallState {
  interrupted: boolean;
  rejectRun: (reason: AiFailureReason) => void;
}

export function createCallState(): CallState {
  const state: CallState = {
    interrupted: false,
    // Until the interruption promise exists, an abort only records the flag; afterwards it also rejects the run.
    rejectRun: () => {
      state.interrupted = true;
    },
  };
  return state;
}

export function interruptionOf(state: CallState): Promise<never> {
  return new Promise<never>((_, reject) => {
    state.rejectRun = (reason) => {
      state.interrupted = true;
      reject(new AiFailure(reason));
    };
  });
}

export function checkedBy(state: CallState, signal: AbortSignal) {
  return async <T>(promise: Promise<T>) => {
    const value = await promise;
    if (state.interrupted || signal.aborted) throw new AiFailure("cancelled");
    return value;
  };
}
