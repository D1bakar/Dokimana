import Link from 'next/link'
import type { Metadata } from 'next'
import reportData from '@/data/example-report.json'
import { readExampleReport } from '@/lib/site-data'

const description =
  'A trimmed sample evidence report generated from a local Dokimana scan of checked-in fixture files.'

export const metadata: Metadata = {
  title: 'Sample evidence report',
  description,
  alternates: {
    canonical: '/example',
  },
  openGraph: {
    title: 'Sample evidence report — Dokimana',
    description,
    url: '/example',
    type: 'article',
    images: [
      {
        url: '/og.png',
        width: 1280,
        height: 640,
        alt: 'Dokimana: local evidence for Stripe API changes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sample evidence report — Dokimana',
    description,
    images: ['/og.png'],
  },
}

function DataList({ id, title, items }: { id: string; title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <ul className="data-list">
        {items.map((item, index) => (
          <li key={`${id}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default function ExamplePage() {
  const report = readExampleReport(reportData)
  const sections = [
    { id: 'report-status', label: 'Report status' },
    ...(report.summary.length > 0 ? [{ id: 'report-summary', label: 'Counts' }] : []),
    ...(report.changes.length > 0 ? [{ id: 'report-changes', label: 'Structured changes' }] : []),
    ...(report.callSites.length > 0 ? [{ id: 'report-call-sites', label: 'Call-site findings' }] : []),
    ...(report.needsHuman.length > 0 ? [{ id: 'report-needs-human', label: 'Needs human review' }] : []),
    ...(report.verification.length > 0 ? [{ id: 'report-verification', label: 'Verification' }] : []),
    ...(report.limitations.length > 0 ? [{ id: 'report-limitations', label: 'Limits' }] : []),
  ]

  return (
    <div className="shell">
      <header className="masthead">
        <Link href="/" className="wordmark">
          Dokimana
        </Link>
        <p className="masthead-note">Local evidence for Stripe API changes</p>
        <Link className="masthead-source" href="/">
          Document
        </Link>
      </header>

      <div className="workspace">
        <nav className="contents" aria-label="Report sections">
          <p className="contents-title">In this report</p>
          <ol className="contents-list">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.label}</a>
              </li>
            ))}
          </ol>
          <p className="contents-related">
            <Link href="/">← Back to the document</Link>
          </p>
        </nav>

        <main id="main" tabIndex={-1}>
          <article className="document">
            <p className="document-path">generated / example report</p>
            <h1>Sample evidence report</h1>
            <p className="document-intro">
              This page renders a trimmed sample from generated JSON. It is a local scan of the
              checked-in Stripe fixture excerpts, not a live API result or a published benchmark.
            </p>

            <section id="report-status" aria-labelledby="report-status-title">
              <h2 id="report-status-title">Report status</h2>
              <p className="data-note">
                {report.note ?? 'No generated report has been published yet.'}
              </p>
              {report.generatedFrom.length > 0 && (
                <p className="data-note">
                  Inputs:{' '}
                  {report.generatedFrom.map((input, index) => (
                    <span key={`${input}-${index}`}>
                      {index > 0 ? ', ' : ''}
                      <code>{input}</code>
                    </span>
                  ))}
                </p>
              )}
              {report.truncation.length > 0 && (
                <p className="data-note">{report.truncation.join(' ')}</p>
              )}
            </section>

            {report.summary.length > 0 && (
              <section id="report-summary" aria-labelledby="report-summary-title">
                <h2 id="report-summary-title">Counts</h2>
                <ul className="data-list">
                  {report.summary.map((item) => (
                    <li key={item.label}>
                      <code>{item.label}</code>: {item.value}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <DataList id="report-changes" title="Structured changes" items={report.changes} />
            <DataList id="report-call-sites" title="Call-site findings" items={report.callSites} />
            <DataList id="report-needs-human" title="Needs human review" items={report.needsHuman} />
            <DataList id="report-verification" title="Verification" items={report.verification} />
            <DataList id="report-limitations" title="Limits" items={report.limitations} />
          </article>
        </main>
      </div>

      <footer className="statusline">
        <p>Dokimana · local files only · Node.js 20+ · verification: could_not_run</p>
        <Link href="/">Back to the document</Link>
      </footer>
    </div>
  )
}
