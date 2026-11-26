import Link from 'next/link'
import type { Metadata } from 'next'
import { CodeBlock } from '@/components/codeblock'

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Reference for the ApiProof CLI: scan, report, verify, and doctor commands, GitHub Action inputs, report contents, and supported scope.',
}

export default function DocsPage() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>Docs</h1>
          <p>
            Reference for the ApiProof CLI and GitHub Action. Every command reads local files; none
            of them calls Stripe or executes repository code.
          </p>
          <p className="doc-crosslink">
            New here? Start with the <Link href="/quickstart">quick start</Link>, or read{' '}
            <Link href="/method">how the evidence trail is built</Link>.
          </p>
        </div>
      </section>

      <section className="section" id="commands">
        <div className="section-inner">
          <h2>Command reference</h2>
          <p>
            Commands run through <code>npm run dev -- &lt;command&gt;</code> in development, or{' '}
            <code>apiproof &lt;command&gt;</code> after a build.
          </p>
          <table className="flag-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Reads</th>
                <th>Writes</th>
                <th>Exit behavior</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>scan</code>
                </td>
                <td>Two OpenAPI JSON files and a repository path</td>
                <td>Impact JSON and/or Markdown evidence</td>
                <td>Non-zero on invalid input, or on changes when the gate is enabled</td>
              </tr>
              <tr>
                <td>
                  <code>report</code>
                </td>
                <td>An impact JSON file</td>
                <td>Markdown evidence</td>
                <td>Non-zero on invalid or unreadable input</td>
              </tr>
              <tr>
                <td>
                  <code>verify</code>
                </td>
                <td>A scenario JSON file and the environment</td>
                <td>Verification JSON when requested</td>
                <td>
                  Non-zero for an unsafe key or <code>could_not_run</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>doctor</code>
                </td>
                <td>
                  <code>STRIPE_SECRET_KEY</code>
                </td>
                <td>Terminal output only</td>
                <td>Non-zero when the key is missing or unsafe</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            Flags for each command are listed in the{' '}
            <Link href="/quickstart#flags">flags table</Link>.
          </p>
        </div>
      </section>

      <section className="section" id="action">
        <div className="section-inner">
          <h2>GitHub Action</h2>
          <p>
            The Action runs the scan against workspace-relative OpenAPI files, writes both reports,
            and can fail the job when structural changes are found. It does not download inputs or
            contact Stripe.
          </p>
          <CodeBlock
            code={`- uses: ./
  with:
    repo: .
    old-openapi: path/to/old-openapi.json
    new-openapi: path/to/new-openapi.json
    old-version: old-version-label
    new-version: new-version-label
    impact-output: apiproof-impact.json
    report-output: apiproof-evidence.md
    fail-on-changes: 'true'`}
          />
          <table className="flag-table">
            <thead>
              <tr>
                <th>Input</th>
                <th>Required</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>old-openapi</code>, <code>new-openapi</code>
                </td>
                <td>Yes</td>
                <td>Structured OpenAPI JSON files already present in the checkout</td>
              </tr>
              <tr>
                <td>
                  <code>old-version</code>, <code>new-version</code>
                </td>
                <td>Yes</td>
                <td>
                  Labels used when a document has no <code>info.version</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>repo</code>
                </td>
                <td>No</td>
                <td>
                  Repository root relative to the workspace; defaults to <code>.</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>impact-output</code>, <code>report-output</code>
                </td>
                <td>No</td>
                <td>Output paths; their parent directories must exist</td>
              </tr>
              <tr>
                <td>
                  <code>fail-on-changes</code>
                </td>
                <td>No</td>
                <td>Fails after writing reports when changes are found; defaults to true</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            Pin and review the OpenAPI inputs in your own workflow. The Action cannot discover which
            files are the right baseline for your account.
          </p>
        </div>
      </section>

      <section className="section" id="reports">
        <div className="section-inner">
          <h2>What the reports contain</h2>
          <p>
            The impact JSON records detected structural changes, likely call-site findings,
            confidence, source evidence, and coverage limitations. The Markdown report presents the
            same evidence for code review.
          </p>
          <div className="docs-cols">
            <div className="docs-col">
              <h3>Included</h3>
              <ul className="docs-list">
                <li>Change kind, path, and old/new values where applicable</li>
                <li>File, line, and a source excerpt for each likely finding</li>
                <li>
                  Explicit confidence and <code>needs_human</code> outcomes
                </li>
                <li>Stated coverage limits and unverified patterns</li>
              </ul>
            </div>
            <div className="docs-col">
              <h3>Not proof of</h3>
              <ul className="docs-list">
                <li>Runtime failure or successful runtime behavior</li>
                <li>Complete call-site coverage across any repository</li>
                <li>That no other breaking dependency exists</li>
                <li>Correct replacement semantics for an unsupported change</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="scope">
        <div className="section-inner">
          <h2>Supported scope</h2>
          <div className="coverage-cols">
            <div className="coverage-col">
              <h3>Detected</h3>
              <ul className="plain-list">
                <li>Removed schema or endpoint</li>
                <li>Removed parameter or nested field</li>
                <li>Requiredness increase</li>
                <li>Field type change or removed enum value</li>
                <li>Local component-schema references</li>
              </ul>
            </div>
            <div className="coverage-col">
              <h3>Outside current coverage</h3>
              <ul className="plain-list">
                <li>Rename inference or invented replacement fields</li>
                <li>External or nested JSON Pointer references</li>
                <li>Parameter schema comparison and constraints</li>
                <li>Dynamic clients, REST calls, generated or vendor code</li>
                <li>Scenario execution and runtime behavior</li>
              </ul>
            </div>
          </div>
          <p className="note">
            A scan that finds nothing is not proof that nothing is affected. Unsupported outcomes
            remain <code>needs_human</code>.
          </p>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Read the full README</h2>
          <Link
            href="https://github.com/D1bakar/Dokimana/blob/main/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="button button--solid button--large"
          >
            Open README
          </Link>
        </div>
      </section>
    </div>
  )
}
