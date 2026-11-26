import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ChangeDetector } from '../src/diff/change-detector.js';
import { assertOpenApiInput, buildOpenApiIndex } from '../src/diff/structured-diff.js';

async function parsedDocument(path: string) {
  const text = await readFile(path, 'utf8');
  const value: unknown = JSON.parse(text);
  assertOpenApiInput(value, path);
  return { value, bytes: Buffer.byteLength(text, 'utf8') };
}

const oldPath = resolve(process.argv[2] ?? 'src/diff/fixtures/stripe-real-old.json');
const newPath = resolve(process.argv[3] ?? 'src/diff/fixtures/stripe-real-new.json');
const iterations = Number.parseInt(process.argv[4] ?? '50', 10);
if (!Number.isInteger(iterations) || iterations < 1) {
  throw new Error('Iterations must be a positive integer.');
}

const oldDocument = await parsedDocument(oldPath);
const newDocument = await parsedDocument(newPath);
const oldIndex = buildOpenApiIndex(oldDocument.value);
const newIndex = buildOpenApiIndex(newDocument.value);
const detector = new ChangeDetector();

const startedAt = performance.now();
let changeCount = 0;
for (let index = 0; index < iterations; index += 1) {
  changeCount = detector.diffIndexes({
    oldIndex,
    newIndex,
    newVersion: newDocument.value.info?.version ?? 'benchmark',
  }).length;
}
const totalMs = performance.now() - startedAt;

console.log(
  JSON.stringify(
    {
      oldPath,
      newPath,
      oldBytes: oldDocument.bytes,
      newBytes: newDocument.bytes,
      iterations,
      parsedOnce: true,
      indexedOnce: true,
      changes: changeCount,
      totalMs: Number(totalMs.toFixed(3)),
      averageMs: Number((totalMs / iterations).toFixed(4)),
    },
    null,
    2,
  ),
);
