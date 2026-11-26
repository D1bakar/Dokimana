import type { Metadata } from 'next'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ApiProof — Local evidence for Stripe API changes',
    template: '%s — ApiProof',
  },
  description:
    'Compare supplied Stripe OpenAPI contracts, find likely TypeScript and JavaScript call sites, and get an honest evidence report. Local-first CLI with no live Stripe calls.',
  applicationName: 'ApiProof',
  keywords: [
    'Stripe API changes',
    'OpenAPI diff',
    'breaking changes',
    'TypeScript',
    'JavaScript',
    'static analysis',
  ],
  openGraph: {
    title: 'ApiProof — Local evidence for Stripe API changes',
    description:
      'Compare supplied Stripe OpenAPI contracts, find likely TypeScript and JavaScript call sites, and get an honest evidence report.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ApiProof — Local evidence for Stripe API changes',
    description:
      'Local-first CLI for Stripe API change impact with evidence and explicit limits.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
