import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Report an ApiProof bug, raise a security concern privately, or start a discussion.',
}

export default function ContactPage() {
  return (
    <div className="page">
      <section className="section section--hero">
        <div className="section-inner">
          <h1>Contact</h1>
          <p>Questions about ApiProof, the CLI, or this site? Get in touch.</p>
        </div>
      </section>

      <section className="section" id="reach-us">
        <div className="section-inner">
          <h2>Reach us</h2>
          <ul className="contact-list">
            <li>
              <strong>Issues &amp; bugs:</strong>
              <Link
                href="https://github.com/D1bakar/Dokimana/issues"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open a GitHub issue
              </Link>
            </li>
            <li>
              <strong>Security:</strong> Do not open a public issue for security concerns. Contact
              the maintainers privately.
            </li>
            <li>
              <strong>General:</strong> Start a GitHub discussion in the repository.
            </li>
          </ul>
        </div>
      </section>

      <section className="section section--cta">
        <div className="section-inner">
          <h2>Back to the project</h2>
          <Link href="/" className="button button--solid button--large">
            Homepage
          </Link>
        </div>
      </section>
    </div>
  )
}
