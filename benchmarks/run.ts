import { benchmarkRepositories } from './data-model.js';

export interface BenchmarkResultRow {
  id: string;
  status: 'not_run';
  measured: false;
  findings: 0;
  humanReview: 0;
  couldNotRun: 0;
}

const rows: BenchmarkResultRow[] = benchmarkRepositories.map((repository) => ({
  id: repository.id,
  status: 'not_run',
  measured: false,
  findings: 0,
  humanReview: 0,
  couldNotRun: 0,
}));

console.log(JSON.stringify({ measured: false, rows }, null, 2));
