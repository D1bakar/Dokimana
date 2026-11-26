export type Provider = 'stripe';

export interface ProviderSource {
  kind: 'openapi' | 'changelog';
  provider: Provider;
  version: string;
  checksumSha256: string;
}

export type ChangeContext =
  | 'schema'
  | 'operation'
  | 'request_parameter'
  | 'request_body'
  | 'response'
  | 'webhook_event';

export type ChangeKind =
  | 'field_removed'
  | 'field_renamed'
  | 'field_type_changed'
  | 'field_became_required'
  | 'schema_removed'
  | 'expandable_field_removed'
  | 'expandable_target_removed'
  | 'parameter_removed'
  | 'parameter_renamed'
  | 'parameter_became_required'
  | 'parameter_type_changed'
  | 'parameter_enum_value_removed'
  | 'request_body_removed'
  | 'response_removed'
  | 'endpoint_removed'
  | 'webhook_removed'
  | 'enum_value_removed';

export interface ChangeRecord {
  id: string;
  provider: Provider;
  kind: ChangeKind;
  context?: ChangeContext;
  resource: string;
  path?: string;
  operation?: string;
  eventType?: string;
  oldValue: string;
  newValue?: string;
  breaking: true;
  source: ProviderSource;
  evidence: string;
}

export type CallSiteKind =
  | 'sdk_call'
  | 'sdk_field'
  | 'typed_field'
  | 'expand_array'
  | 'webhook_handler'
  | 'helper_wrapper';

export interface CallSite {
  file: string;
  line: number;
  column: number;
  operation: string;
  openApiOperation?: string;
  fieldPath: string[];
  kind: CallSiteKind;
  snippet: string;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface ImpactFinding {
  changeId: string;
  callSite: CallSite;
  confidence: Confidence;
  reason: string;
  confidenceReason: string;
}

export interface NeedsHumanItem {
  changeId: string;
  kind: ChangeKind;
  context?: ChangeContext;
  resource: string;
  path?: string;
  reason: string;
}

export type UnresolvedKind =
  | 'dynamic_call'
  | 'rest_call'
  | 'spread_argument'
  | 'unresolved_import'
  | 'unknown_type'
  | 'dynamic_webhook_case';

export interface UnresolvedItem {
  file: string;
  line: number;
  column: number;
  kind: UnresolvedKind;
  snippet: string;
  reason: string;
  relatedChangeIds: string[];
}

export interface ImpactReport {
  generatedAt: string;
  root: string;
  changes: ChangeRecord[];
  findings: ImpactFinding[];
  needsHuman: NeedsHumanItem[];
  unresolved: UnresolvedItem[];
  unverifiedCallSiteCoverage: string[];
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
  executedAt?: string;
}

export interface EvidenceReport {
  generatedAt: string;
  repository: string;
  providerVersion: string;
  impactAnalysis: 'static_evidence' | 'none';
  changes: ChangeRecord[];
  findings: ImpactFinding[];
  needsHuman: NeedsHumanItem[];
  unresolved?: UnresolvedItem[];
  verification: VerificationResult[];
  limitations: string[];
}
