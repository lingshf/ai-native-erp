// SQLite `PRAGMA application_id` of an ERP database ("ERP2"). Kept free of driver imports so
// read-only paths (legacy reconciliation) can check it without loading Kysely.
export const APPLICATION_ID = 0x45525032;
