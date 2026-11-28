import { readFile } from 'node:fs/promises';

interface CpuProfileNode {
  readonly id: number;
  readonly callFrame: {
    readonly functionName: string;
    readonly url: string;
  };
}

interface CpuProfile {
  readonly nodes: readonly CpuProfileNode[];
  readonly samples: readonly number[];
  readonly timeDeltas: readonly number[];
}

interface FrameSummary {
  readonly label: string;
  readonly selfMs: number;
}

const profilePath = process.argv[2];
if (profilePath === undefined) throw new Error('Expected a Node.js .cpuprofile path.');

const profile = parseProfile(JSON.parse(await readFile(profilePath, 'utf8')) as unknown);
const selfTimeById = new Map<number, number>();
for (let index = 0; index < profile.samples.length; index += 1) {
  const nodeId = profile.samples[index];
  const delta = profile.timeDeltas[index];
  if (nodeId === undefined || delta === undefined) continue;
  selfTimeById.set(nodeId, (selfTimeById.get(nodeId) ?? 0) + delta / 1000);
}

const labels = new Map<number, string>();
for (const node of profile.nodes) {
  labels.set(node.id, `${frameName(node.callFrame.functionName)} ${node.callFrame.url}`);
}

const summaries: FrameSummary[] = [];
for (const [nodeId, selfMs] of selfTimeById) {
  const label = labels.get(nodeId);
  if (label === undefined) continue;
  summaries.push({ label, selfMs });
}
summaries.sort((left, right) => right.selfMs - left.selfMs);

const totalMs = summaries.reduce((total, item) => total + item.selfMs, 0);
console.log(
  JSON.stringify(
    {
      profilePath,
      totalSampledMs: Math.round(totalMs * 100) / 100,
      topSelfTime: summaries.slice(0, 20).map((item) => ({
        frame: item.label,
        selfMs: Math.round(item.selfMs * 100) / 100,
        percent: totalMs === 0 ? 0 : Math.round((item.selfMs / totalMs) * 10000) / 100,
      })),
    },
    null,
    2,
  ),
);

function frameName(value: string): string {
  return value.length === 0 ? '(anonymous)' : value;
}

function parseProfile(value: unknown): CpuProfile {
  if (!isRecord(value)) throw new Error('CPU profile must be a JSON object.');
  if (
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.samples) ||
    !Array.isArray(value.timeDeltas)
  ) {
    throw new Error('CPU profile must contain nodes, samples, and timeDeltas arrays.');
  }

  const nodes: CpuProfileNode[] = [];
  for (const item of value.nodes) {
    if (!isRecord(item)) throw new Error('CPU profile node must be an object.');
    const id = item.id;
    const callFrame = item.callFrame;
    if (typeof id !== 'number' || !isRecord(callFrame)) {
      throw new Error('CPU profile node must contain a numeric id and a callFrame.');
    }
    const functionName = callFrame.functionName;
    const url = callFrame.url;
    if (typeof functionName !== 'string' || typeof url !== 'string') {
      throw new Error('CPU profile callFrame must contain functionName and url strings.');
    }
    nodes.push({ id, callFrame: { functionName, url } });
  }

  const samples = value.samples.filter((item): item is number => typeof item === 'number');
  const timeDeltas = value.timeDeltas.filter((item): item is number => typeof item === 'number');
  if (samples.length !== timeDeltas.length) {
    throw new Error('CPU profile samples and timeDeltas must have the same length.');
  }
  return { nodes, samples, timeDeltas };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
