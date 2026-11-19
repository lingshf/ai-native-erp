import { producerFixture } from "../packages/infra/test/support/legacy-producer-fixture.mjs";
import { produceLegacySnapshot } from "./legacy-snapshot-producer.mjs";

const cleanup = [];
try {
  const fixture = producerFixture({ onTestFinished: (fn) => cleanup.push(fn) }, { million: true });
  const start = performance.now();
  await produceLegacySnapshot(fixture.source, fixture.output);
  const durationMs = performance.now() - start;
  console.log(JSON.stringify({ fictional: true, glLines: 1000000, durationMs, limitMs: 60000 }));
  if (durationMs > 60000) throw new Error("Legacy snapshot benchmark exceeded 60 seconds.");
} finally {
  for (const fn of cleanup) fn();
}
