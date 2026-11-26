import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Safety',
  description:
    'ApiProof key safety, live-key refusal, and execution boundaries. The current runner reports could_not_run instead of executing repository code.',
}

export default function SafetyPage() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>Safety is a boundary, not a badge</h1>
          <p>
            Current commands make no live Stripe calls. Key checks reject unsafe patterns, and
            verification stops before executing repository code.
          </p>
        </div>
      </section>

      <section className="section section--split" id="keys">
        <div className="section-inner">
          <div className="side">
            <h2>Keys are checked first</h2>
            <p>
              The site itself has no key field and makes no Stripe API requests. All checks happen
              locally in the CLI.
            </p>
          </div>
          <div className="prose">
            <p>
              <code>doctor</code> validates <code>STRIPE_SECRET_KEY</code>.<code>verify</code>{' '}
              checks environment values for live-key patterns and accepts only recognized test-key
              formats before processing a scenario.
            </p>
            <p>
              <code>scan</code> and <code>report</code> use local files. No current command makes a
              live Stripe API call or runs repository code.
            </p>
          </div>
        </div>
      </section>

      <section className="section" id="execution">
        <div className="section-inner">
          <h2>Execution boundaries</h2>
          <p>
            Repository builds, tests, package scripts, and generated code are treated as untrusted.
            These are requested container boundaries, not a running sandbox.
          </p>
          <table className="boundary-table">
            <thead>
              <tr>
                <th>Boundary</th>
                <th>Requested setting</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Network</td>
                <td>Disabled</td>
              </tr>
              <tr>
                <td>Secrets</td>
                <td>None passed to the container</td>
              </tr>
              <tr>
                <td>Source mount</td>
                <td>Read-only</td>
              </tr>
              <tr>
                <td>Timeout</td>
                <td>300 seconds</td>
              </tr>
              <tr>
                <td>Host Docker socket</td>
                <td>Not mounted</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            The current runner does not execute code and reports
            <code>could_not_run</code>. A missing run is never reported as a pass.
          </p>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Start locally</h2>
          <p>Key safety is built into every command by default.</p>
          <Link href="/quickstart" className="button button--solid button--large">
            Open the quick start
          </Link>
        </div>
      </section>
    </div>
  )
}
