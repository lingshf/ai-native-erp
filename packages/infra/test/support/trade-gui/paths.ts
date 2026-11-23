// Repository root and the trade E2E artifacts directory.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const artifacts = resolve(process.env.ERP_E2E_ARTIFACTS ?? join(root, "artifacts/ci/trade-e2e"));

export { artifacts, root };
