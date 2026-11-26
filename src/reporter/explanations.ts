import type { ChangeKind } from '../domain/types.js';

export type ChangeSeverity = 'high' | 'medium' | 'low';

export interface ChangeExplanation {
  why: string;
  check: string;
}

export function explainChange(kind: ChangeKind): ChangeExplanation {
  switch (kind) {
    case 'field_removed':
      return {
        why: 'A field present in the old supplied specification is absent in the new one.',
        check: 'Find code that reads or writes this field and confirm how each site handles its absence.',
      };
    case 'field_renamed':
      return {
        why: "A field's name changed between the supplied specifications.",
        check: 'Find code using the old name and confirm whether it should use the new name.',
      };
    case 'field_type_changed':
      return {
        why: "A field's declared type differs between the supplied specifications.",
        check: 'Find code that assigns or reads this field and confirm the new type still fits.',
      };
    case 'field_became_required':
      return {
        why: 'A field that could previously be omitted is now required by the supplied specification.',
        check: 'Find code that builds objects without this field and confirm it now supplies a value.',
      };
    case 'schema_removed':
      return {
        why: 'A schema present in the old supplied specification is absent in the new one.',
        check: 'Find code and types that reference this schema and confirm how they should handle its absence.',
      };
    case 'expandable_field_removed':
      return {
        why: 'A field that could be expanded is absent in the new supplied specification.',
        check: 'Find expand arrays and field reads that name this field and confirm how they should handle its absence.',
      };
    case 'expandable_target_removed':
      return {
        why: 'A target that could be expanded is no longer listed for this field in the supplied specification.',
        check: 'Find expand arrays that name this target and confirm how they should handle its absence.',
      };
    case 'parameter_removed':
      return {
        why: 'A request parameter present in the old supplied specification is absent in the new one.',
        check: 'Find calls that pass this parameter and confirm how each site handles its absence.',
      };
    case 'parameter_renamed':
      return {
        why: "A request parameter's name changed between the supplied specifications.",
        check: 'Find calls that pass the old name and confirm whether they should use the new name.',
      };
    case 'parameter_became_required':
      return {
        why: 'A request parameter that could previously be omitted is now required by the supplied specification.',
        check: 'Find calls that omit this parameter and confirm they now supply a value.',
      };
    case 'parameter_type_changed':
      return {
        why: "A request parameter's declared type differs between the supplied specifications.",
        check: 'Find calls that pass this parameter and confirm the values still match the new type.',
      };
    case 'parameter_enum_value_removed':
      return {
        why: 'A value the old supplied specification allowed for a parameter is no longer listed.',
        check: 'Find calls that pass this value and confirm which value is documented as supported.',
      };
    case 'request_body_removed':
      return {
        why: 'The request body for an operation is absent in the new supplied specification.',
        check: 'Find calls that send a body to this operation and confirm how they should handle that.',
      };
    case 'response_removed':
      return {
        why: 'A response shape for an operation is absent in the new supplied specification.',
        check: 'Find code that reads fields from that response and confirm how it handles its absence.',
      };
    case 'endpoint_removed':
      return {
        why: 'An operation present in the old supplied specification is absent in the new one.',
        check: 'Find calls to this operation and confirm how each site handles its absence.',
      };
    case 'webhook_removed':
      return {
        why: 'A webhook event type present in the old supplied specification is absent in the new one.',
        check: 'Find handlers for this event type and confirm how each handles its absence.',
      };
    case 'enum_value_removed':
      return {
        why: 'A value the old supplied specification allowed for a field is no longer listed.',
        check: 'Find code that reads or writes this value and confirm which value is documented as supported.',
      };
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled change kind: ${exhaustive}`);
    }
  }
}

export function severityForChange(kind: ChangeKind): 'high' | 'medium' | 'low' {
  switch (kind) {
    case 'field_removed':
    case 'field_renamed':
    case 'field_type_changed':
    case 'field_became_required':
    case 'schema_removed':
    case 'parameter_removed':
    case 'parameter_renamed':
    case 'parameter_became_required':
    case 'parameter_type_changed':
    case 'request_body_removed':
    case 'response_removed':
    case 'endpoint_removed':
    case 'webhook_removed':
      return 'high';
    case 'expandable_field_removed':
    case 'expandable_target_removed':
    case 'parameter_enum_value_removed':
    case 'enum_value_removed':
      return 'medium';
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled change kind: ${exhaustive}`);
    }
  }
}
