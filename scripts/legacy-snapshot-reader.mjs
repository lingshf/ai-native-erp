import { StorageError } from "@erp/core/application";
import {
  preflightLegacySnapshotPair,
  openLegacyTeachingSnapshot,
} from "@erp/infra/legacy-teaching";
import { verifyLedgerSnapshot } from "./legacy-snapshot-verifier.mjs";

export function openVerifiedTeachingReader(directory) {
  preflightLegacySnapshotPair(directory);
  const verifiedManifest = verifyLedgerSnapshot(directory);
  try {
    return openLegacyTeachingSnapshot({ directory, verifiedManifest });
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("STORAGE_FAILURE");
  }
}
