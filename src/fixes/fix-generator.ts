import { readFile } from 'node:fs/promises';
import type { ChangeRecord, ImpactFinding, Patch } from '../domain/types.js';

export interface FixGeneratorPort {
  generate(change: ChangeRecord, finding: ImpactFinding): Promise<Patch>;
}

export class FixGenerator implements FixGeneratorPort {
  async generate(change: ChangeRecord, finding: ImpactFinding): Promise<Patch> {
    const source = await readFile(finding.callSite.file, 'utf8');
    const snippet = finding.callSite.snippet;
    let replacement = snippet;
    let status: Patch['status'] = 'needs_human';
    let explanation = 'No deterministic, evidence-backed field mapping is available.';

    if (change.kind === 'field_renamed' && change.path && change.newValue) {
      replacement = snippet.replaceAll(change.path, change.newValue);
      status = 'ready';
      explanation = `Renamed field "${change.path}" to explicitly provided field "${change.newValue}".`;
    } else if (
      change.kind === 'field_type_changed' ||
      change.kind === 'parameter_removed' ||
      change.kind === 'field_removed'
    ) {
      explanation = `Cannot safely delete or transform "${change.path ?? change.resource}" because semantics are unknown.`;
    } else if (change.kind === 'enum_value_removed') {
      explanation = `Cannot safely replace enum value "${change.oldValue}" without an explicit supported mapping.`;
    }

    return {
      id: `patch_${change.id}_${finding.callSite.line}`,
      changeId: change.id,
      status,
      file: finding.callSite.file,
      original: source.includes(snippet) ? snippet : finding.callSite.snippet,
      replacement,
      explanation,
      confidence: status === 'ready' ? 'deterministic' : 'none',
    };
  }
}
