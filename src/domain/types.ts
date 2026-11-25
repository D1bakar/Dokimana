export type Provider = 'stripe';

export interface ProviderSource {
  kind: 'openapi' | 'changelog';
  provider: Provider;
  version: string;
  fetchedAt: string;
  checksumSha256: string;
}

export type ChangeKind =
  | 'field_removed'
  | 'field_renamed'
  | 'field_type_changed'
  | 'schema_removed'
  | 'parameter_removed'
  | 'parameter_renamed'
  | 'parameter_became_required'
  | 'parameter_type_changed'
  | 'parameter_enum_value_removed'
  | 'endpoint_removed'
  | 'enum_value_removed';

export interface ChangeRecord {
  id: string;
  provider: Provider;
  kind: ChangeKind;
  resource: string;
  path?: string;
  oldValue: string;
  newValue?: string;
  breaking: true;
  source: ProviderSource;
  evidence: string;
}

export interface CallSite {
  file: string;
  line: number;
  column: number;
  operation: string;
  fieldPath: string[];
  kind: 'sdk_call' | 'sdk_field';
  snippet: string;
}

export interface ImpactFinding {
  changeId: string;
  callSite: CallSite;
  confidence: 'high' | 'medium';
  reason: string;
}

export interface ImpactReport {
  generatedAt: string;
  root: string;
  changes: ChangeRecord[];
  findings: ImpactFinding[];
  unverifiedCallSiteCoverage: string[];
}

export type PatchStatus = 'ready' | 'needs_human';

export interface Patch {
  id: string;
  changeId: string;
  status: PatchStatus;
  file: string;
  original: string;
  replacement: string;
  explanation: string;
  confidence: 'deterministic' | 'none';
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  apiVersion: string;
  operation: string;
  input: Record<string, unknown>;
  expectedOutput?: Record<string, unknown>;
}

export type VerificationClassification =
  'equivalent' | 'intentionally_different' | 'unexplained_difference' | 'could_not_run';

export interface VerificationResult {
  scenarioId: string;
  classification: VerificationClassification;
  oldOutput?: unknown;
  newOutput?: unknown;
  normalizedDifference?: string[];
  reason: string;
  container: {
    isolated: boolean;
    network: 'none' | 'restricted' | 'not_run';
    secrets: 'none';
  };
  executedAt: string;
}

export interface EvidenceReport {
  generatedAt: string;
  repository: string;
  providerVersion: string;
  impactCoverage: 'verified' | 'partially_verified' | 'unverified';
  changes: ChangeRecord[];
  findings: ImpactFinding[];
  patches: Patch[];
  verification: VerificationResult[];
  limitations: string[];
}
