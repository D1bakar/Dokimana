type UnknownRecord = Record<string, unknown>

export interface ExampleRunData {
  status: string
  source?: string
  note?: string
  commands: string[]
  output: string[]
}

export interface LabelValue {
  label: string
  value: string
}

export interface ExampleReportData {
  status: string
  note?: string
  generatedFrom: string[]
  summary: LabelValue[]
  changes: string[]
  callSites: string[]
  needsHuman: string[]
  verification: string[]
  limitations: string[]
  truncation: string[]
}

export interface AccuracyMetric {
  label: string
  value: string
  detail?: string
}

export interface AccuracyData {
  status: string
  note?: string
  source?: string
  metrics: AccuracyMetric[]
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readMetricValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return readString(value)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const text = readString(entry)
    return text === undefined ? [] : [text]
  })
}

function readLabelValues(value: unknown): LabelValue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const label = readString(entry.label)
    const itemValue = readString(entry.value)
    if (label === undefined || itemValue === undefined) return []
    return [{ label, value: itemValue }]
  })
}

export function readExampleRun(value: unknown): ExampleRunData {
  if (!isRecord(value)) {
    return { status: 'unavailable', note: 'Generated sample data is unavailable.', commands: [], output: [] }
  }

  return {
    status: readString(value.status) ?? 'unavailable',
    source: readString(value.source),
    note: readString(value.note),
    commands: readStringArray(value.commands),
    output: readStringArray(value.output),
  }
}

export function readExampleReport(value: unknown): ExampleReportData {
  if (!isRecord(value)) {
    return {
      status: 'unavailable',
      note: 'Generated report data is unavailable.',
      generatedFrom: [],
      summary: [],
      changes: [],
      callSites: [],
      needsHuman: [],
      verification: [],
      limitations: [],
      truncation: [],
    }
  }

  return {
    status: readString(value.status) ?? 'unavailable',
    note: readString(value.note),
    generatedFrom: readStringArray(value.generatedFrom),
    summary: readLabelValues(value.summary),
    changes: readStringArray(value.changes),
    callSites: readStringArray(value.callSites),
    needsHuman: readStringArray(value.needsHuman),
    verification: readStringArray(value.verification),
    limitations: readStringArray(value.limitations),
    truncation: readStringArray(value.truncation),
  }
}

export function readAccuracy(value: unknown): AccuracyData {
  if (!isRecord(value)) {
    return {
      status: 'unavailable',
      note: 'Measured accuracy data is unavailable.',
      metrics: [],
    }
  }

  const metrics = Array.isArray(value.metrics)
    ? value.metrics.flatMap((entry) => {
        if (!isRecord(entry)) return []
        const label = readString(entry.label)
        const metricValue = readMetricValue(entry.value)
        if (label === undefined || metricValue === undefined) return []
        const detail = readString(entry.detail)
        return [detail === undefined ? { label, value: metricValue } : { label, value: metricValue, detail }]
      })
    : []

  return {
    status: readString(value.status) ?? 'unavailable',
    note: readString(value.note),
    source: readString(value.source),
    metrics,
  }
}
