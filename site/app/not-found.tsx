import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'This page does not exist. The Dokimana document is on the homepage.',
}

export default function NotFound() {
  return (
    <div className="shell">
      <main id="main" tabIndex={-1} className="document not-found">
        <p className="document-path">404 / dokimana</p>
        <h1>Page not found</h1>
        <p>The address may be wrong, or the page may have moved.</p>
        <p>
          <Link href="/">Read the Dokimana document</Link>
        </p>
      </main>
    </div>
  )
}
