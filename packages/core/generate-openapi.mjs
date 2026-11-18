import { writeFileSync } from 'node:fs';
import { openApiDocument } from './src/contracts/index.ts';

const filename = process.argv[2];
if (!filename) throw new Error('Usage: npm run openapi -- OUTPUT.json');
writeFileSync(filename, JSON.stringify(openApiDocument, null, 2) + '\n');
