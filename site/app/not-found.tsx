import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist. Go to the ApiProof method, safety, or quick start page.',
}

export default function NotFound() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>Page not found</h1>
          <p>The address may be wrong, or the page may have moved.</p>
        </div>
      </section>

      <section className="section" id="go-to">
        <div className="section-inner">
          <h2>Go to a useful page</h2>
          <ul className="plain-list">
            <li>
              <Link href="/method">How a change becomes a report</Link>
            </li>
            <li>
              <Link href="/safety">Key refusal and execution limits</Link>
            </li>
            <li>
              <Link href="/quickstart">Install the CLI and run fixtures</Link>
            </li>
          </ul>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Back to the homepage</h2>
          <Link href="/" className="button button--solid button--large">
            Homepage
          </Link>
        </div>
      </section>
    </div>
  )
}
