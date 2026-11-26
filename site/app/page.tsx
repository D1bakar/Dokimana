import Link from 'next/link'
import { CodeBlock } from '@/components/codeblock'

export default function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-inner">
          <h1>Trace Stripe API changes to the code that depends on them.</h1>
          <p className="hero-sub">
            Compare two OpenAPI contracts, find the TypeScript and JavaScript call sites that may
            break, and get an honest evidence report — nothing claimed that is not verified.
          </p>
          <div className="hero-actions">
            <Link href="/quickstart" className="button button--solid button--large">
              Install the CLI
            </Link>
            <Link href="/method" className="button button--outline">
              How it works
            </Link>
          </div>
          <p className="hero-note">
            Node.js 20+. No account. No live Stripe key needed for a local scan.
          </p>
        </div>
      </section>

      <section className="section section--tight" id="what-it-does">
        <div className="section-inner">
          <h2>What it does</h2>
          <ul className="checklist">
            <li>
              <strong>Compares contracts.</strong> Diffs old and new OpenAPI JSON for removals, type
              changes, and requiredness increases.
            </li>
            <li>
              <strong>Finds call sites.</strong> Scans your TypeScript and JavaScript for Stripe SDK
              calls that reference changed fields.
            </li>
            <li>
              <strong>Reports evidence.</strong> Outputs JSON and Markdown with confidence and
              coverage limits — so you review, not guess.
            </li>
          </ul>
        </div>
      </section>

      <section className="section section--example" id="example">
        <div className="section-inner">
          <div className="example-wrap">
            <div className="example-copy">
              <h2>Example: a removed field</h2>
              <p>
                A field disappears from the new contract. Your code still passes it. ApiProof
                surfaces the likely match so you can decide before it breaks in production.
              </p>
              <p className="example-disclosure">
                The field names, file path, and line number below are fictional and illustrative —
                no schema or repository was scanned.
              </p>
            </div>
            <div className="example-sheet">
              <div className="sheet-header">
                <h3>Impact report (synthetic)</h3>
                <span className="status">needs review</span>
              </div>
              <div className="contracts">
                <div className="contract">
                  <h4>Before</h4>
                  <CodeBlock
                    code={`{
  "properties": {
    "payout_schedule": { "type": "string" }
  }
}`}
                  />
                </div>
                <div className="contract contract--after">
                  <h4>After</h4>
                  <CodeBlock
                    code={`{
  "properties": {}
}`}
                  />
                </div>
              </div>
              <div className="source">
                <h4>Likely source usage</h4>
                <CodeBlock
                  code={`await stripe.payouts.create({
  payout_schedule: 'daily',
})}`}
                />
                <span className="source-loc">src/payments.ts:42</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--tight" id="honest-limits">
        <div className="section-inner">
          <h2>Honest limits</h2>
          <div className="limits-grid">
            <div className="limit">
              <h3>Static evidence, not runtime proof</h3>
              <p>A match is a lead to review, not proof of a production failure.</p>
            </div>
            <div className="limit">
              <h3>No live Stripe calls</h3>
              <p>Every command reads local files. No key is sent to Stripe.</p>
            </div>
            <div className="limit">
              <h3>Unsupported changes need humans</h3>
              <p>No replacement field is invented. Anything unclear returns needs_human.</p>
            </div>
            <div className="limit">
              <h3>Verification not configured</h3>
              <p>
                The runner reports <code>could_not_run</code> and executes no repository code. A
                missing run is never reported as a pass.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
