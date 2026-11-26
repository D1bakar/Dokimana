import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Method',
  description:
    'How ApiProof compares supplied OpenAPI contracts, detects supported structural changes, and scans likely TypeScript and JavaScript call sites.',
}

export default function MethodPage() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>How the evidence trail is built</h1>
          <p>
            Two contracts go in. Supported changes come out, each tied to likely call sites in your
            repository — with the limits stated plainly.
          </p>
        </div>
      </section>

      <section className="section section--steps" id="stages">
        <div className="section-inner">
          <div className="stage">
            <div className="stage-number">1</div>
            <div>
              <h3>Load local contracts</h3>
              <p>Read old and new OpenAPI JSON files. No provider fetch, no Stripe API call.</p>
            </div>
          </div>
          <div className="stage">
            <div className="stage-number">2</div>
            <div>
              <h3>Detect structural changes</h3>
              <p>
                Removals, type changes, requiredness increases, removed enum values. Local schema
                references supported; rename inference is not.
              </p>
            </div>
          </div>
          <div className="stage">
            <div className="stage-number">3</div>
            <div>
              <h3>Scan likely call sites</h3>
              <p>
                Match field paths on statically identifiable Stripe SDK calls. Dynamic arguments and
                spreads are listed as unverified coverage.
              </p>
            </div>
          </div>
          <div className="stage">
            <div className="stage-number">4</div>
            <div>
              <h3>Propose only supported fixes</h3>
              <p>
                Explicit mappings only. No replacement is invented; unclear changes return
                needs_human. Nothing is rewritten automatically.
              </p>
            </div>
          </div>
          <div className="stage">
            <div className="stage-number">5</div>
            <div>
              <h3>Write reviewable output</h3>
              <p>
                Change, source evidence, confidence, and coverage limits go into terminal, JSON, and
                Markdown reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--coverage" id="coverage">
        <div className="section-inner">
          <div className="coverage-cols">
            <div className="coverage-col">
              <h3>Detected</h3>
              <ul className="plain-list">
                <li>Removed schema or endpoint</li>
                <li>Removed parameter</li>
                <li>Removed nested or array-item field</li>
                <li>Requiredness increase</li>
                <li>Field type change or removed enum value</li>
              </ul>
            </div>
            <div className="coverage-col">
              <h3>Outside current coverage</h3>
              <ul className="plain-list">
                <li>Rename inference</li>
                <li>External or nested JSON Pointer references</li>
                <li>Parameter schema comparison</li>
                <li>REST fetch calls, generated code, vendor code</li>
                <li>Runtime behavior and every call path</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Start with your own contracts</h2>
          <p>No account or live Stripe key is needed for a local scan.</p>
          <Link href="/quickstart" className="button button--solid button--large">
            Open the quick start
          </Link>
        </div>
      </section>
    </div>
  )
}
