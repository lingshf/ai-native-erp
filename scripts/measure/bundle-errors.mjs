// Exit codes and the errors that carry them (re-exported by bundle-compare.mjs).
export const EXIT_CODES = Object.freeze({ pass: 0, budgetFail: 1, usage: 2, provenance: 3 });

export const measureError = (exitCode, message) => Object.assign(new Error(message), { exitCode });
export const usageError = (message) => measureError(EXIT_CODES.usage, message);
