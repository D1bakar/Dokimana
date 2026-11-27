import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderRulesMarkdown } from '../src/diff/rules.js';

const outputPath = resolve('docs/RULES.md');
await writeFile(outputPath, renderRulesMarkdown(), 'utf8');
console.log(`Wrote ${outputPath}`);
