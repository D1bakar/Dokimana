import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description:
    'ApiProof is an early, local-first CLI for finding Stripe API breaking-change impact in TypeScript and JavaScript repositories.',
}

export default function AboutPage() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>About ApiProof</h1>
          <p>
            ApiProof is an early, CLI-first tool for identifying Stripe API breaking changes and
            finding likely affected call sites in TypeScript and JavaScript repositories.
          </p>
        </div>
      </section>

      <section className="section section--mission">
        <div className="section-inner">
          <h2>Mission</h2>
          <p>
            Help engineers review Stripe API changes with evidence, not assumptions. ApiProof
            compares structured OpenAPI documents, scans for likely impacted call sites, generates
            only evidence-backed constrained patches, and produces honest evidence reports.
          </p>
        </div>
      </section>

      <section className="section section--values">
        <div className="section-inner">
          <h2>What we believe</h2>
          <ul className="values-list">
            <li>
              <strong>Truth over marketing.</strong> No invented benchmarks, no fake customers, no
              claims of complete coverage.
            </li>
            <li>
              <strong>Safety first.</strong> No live Stripe secrets, no live API calls, no
              unverified runner presented as isolation.
            </li>
            <li>
              <strong>Local by default.</strong> Everything runs on your machine against files you
              supply.
            </li>
            <li>
              <strong>Humans decide.</strong> Unsupported changes return
              <code>needs_human</code>. Nothing is rewritten automatically.
            </li>
          </ul>
        </div>
      </section>

      <section className="section section--current-limits">
        <div className="section-inner">
          <h2>Current limits</h2>
          <ul className="limits-list">
            <li>
              Scenario verification is not end-to-end; the runner returns <code>could_not_run</code>
              .
            </li>
            <li>AST coverage is statically identified Stripe SDK calls only.</li>
            <li>Fix proposals are limited to explicit old-to-new renames.</li>
            <li>Benchmarks are unmeasured placeholders, not results.</li>
          </ul>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Get involved</h2>
          <p>Read the agent guide and README before contributing.</p>
          <div className="cta-links">
            <Link
              href="https://github.com/D1bakar/Dokimana"
              target="_blank"
              rel="noopener noreferrer"
              className="button button--outline"
            >
              Source code
            </Link>
            <Link href="/contact" className="button button--solid button--large">
              Contact
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
