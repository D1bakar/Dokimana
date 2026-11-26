import Link from 'next/link'
import type { Metadata } from 'next'
import { CodeBlock } from '@/components/codeblock'

export const metadata: Metadata = {
  title: 'Quick start',
  description:
    'Install ApiProof, run a local OpenAPI scan, write Markdown evidence, and check key safety without a live Stripe key.',
}

export default function QuickStartPage() {
  return (
    <div className="page">
      <section className="section section--hero" id="install">
        <div className="section-inner">
          <h1>Start with local files</h1>
          <p>
            Node.js 20+ and npm. No account or live Stripe key. Commands use the checked-in
            fixtures; substitute your own OpenAPI files when ready.
          </p>
          <div className="terminal-wrap">
            <CodeBlock
              code={`git clone https://github.com/D1bakar/Dokimana.git
cd Dokimana
npm ci
npm run build
npm test
npm run dev -- doctor`}
            />
          </div>
          <p className="caption">
            <code>doctor</code> refuses live keys and reports test-key status. No key is required
            for a local scan.
          </p>
        </div>
      </section>

      <section className="section" id="commands">
        <div className="section-inner">
          <h2>Run the workflow you need</h2>
          <p>
            Each command uses local files. Start with <code>scan</code>, then write a reviewable
            report.
          </p>

          <div className="command-row" id="scan">
            <div className="command-copy">
              <h3>Scan for likely impact</h3>
              <p>
                Compare structured inputs and inspect the repository for supported Stripe SDK
                call-site patterns.
              </p>
            </div>
            <div className="terminal-wrap">
              <CodeBlock
                code={`npm run dev -- scan \\
  --repo . \\
  --old fixtures/stripe-old.json \\
  --new fixtures/stripe-new.json \\
  --old-version fixture-old \\
  --new-version fixture-new \\
  --json impact.json`}
              />
            </div>
          </div>

          <div className="command-row" id="report">
            <div className="command-copy">
              <h3>Write evidence for review</h3>
              <p>
                Convert the impact JSON into a Markdown report, keeping confidence and coverage
                limits.
              </p>
            </div>
            <div className="terminal-wrap">
              <CodeBlock
                code={`npm run dev -- report \\
  --repo . \\
  --impact impact.json \\
  --provider-version fixture-new \\
  --output apiproof-evidence.md`}
              />
            </div>
          </div>

          <div className="command-row" id="verify">
            <div className="command-copy">
              <h3>Check verification status</h3>
              <p>
                Provide a scenario to validate safety handling. The current runner returns{' '}
                <code>could_not_run</code> and exits non-zero.
              </p>
            </div>
            <div className="terminal-wrap">
              <CodeBlock
                code={`npm run dev -- verify \\
  --repo . \\
  --scenario ./scenario.json \\
  --json verification.json`}
              />
            </div>
            <div className="scenario">
              <h4>Example scenario.json</h4>
              <CodeBlock
                code={`{
  "id": "sample-scenario",
  "name": "Example operation",
  "description": "Synthetic input for CLI shape only",
  "apiVersion": "example-version",
  "operation": "example.operation",
  "input": {}
}`}
              />
              <p className="note">
                Save this as <code>scenario.json</code>. This is not a test pass: repository code is
                not executed.
              </p>
            </div>
          </div>

          <div className="command-row" id="doctor">
            <div className="command-copy">
              <h3>Check key safety</h3>
              <p>
                Inspect the local environment for unsafe live-key patterns before using the other
                commands.
              </p>
            </div>
            <div className="terminal-wrap">
              <CodeBlock code={`npm run dev -- doctor`} />
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="flags">
        <div className="section-inner">
          <h2>Flags at a glance</h2>
          <p>Invalid or unreadable JSON exits non-zero. None of these flags calls Stripe.</p>
          <table className="flag-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Main flags</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>scan</code>
                </td>
                <td>
                  --repo --old --new --old-version --new-version --json --markdown --fail-on-changes
                </td>
                <td>Diffs inputs and scans likely call sites.</td>
              </tr>
              <tr>
                <td>
                  <code>report</code>
                </td>
                <td>--repo --impact --output --provider-version</td>
                <td>Writes Markdown evidence.</td>
              </tr>
              <tr>
                <td>
                  <code>verify</code>
                </td>
                <td>--repo --scenario --json</td>
                <td>Checks key safety; reports could_not_run.</td>
              </tr>
              <tr>
                <td>
                  <code>doctor</code>
                </td>
                <td>None</td>
                <td>Checks STRIPE_SECRET_KEY.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Understand the method</h2>
          <Link href="/method" className="button button--solid button--large">
            Read how the scan works
          </Link>
        </div>
      </section>
    </div>
  )
}
