import { writeFileSync } from 'node:fs';
import { openApiDocument } from './dist/index.js';

writeFileSync(new URL('./dist/openapi.json', import.meta.url), JSON.stringify(openApiDocument, null, 2) + '\n');
