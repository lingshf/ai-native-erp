import { registerHooks } from "node:module";
import { isMainThread } from "node:worker_threads";

if (isMainThread) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (
        specifier === "better-sqlite3" ||
        specifier.startsWith("better-sqlite3/") ||
        /better[-_]sqlite3.*\.node$/u.test(specifier)
      )
        throw new Error("SQLite is restricted to storage workers");
      return nextResolve(specifier, context);
    },
  });
}
