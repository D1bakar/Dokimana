import type { Metadata } from 'next'
import '@/app/globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dokimana.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Dokimana — Local evidence for Stripe API changes',
    template: '%s — Dokimana',
  },
  description:
    'Compare supplied Stripe OpenAPI contracts, find likely TypeScript and JavaScript call sites, and get an honest evidence report. Local-first CLI with no live Stripe calls.',
  applicationName: 'Dokimana',
  keywords: [
    'Stripe API changes',
    'OpenAPI diff',
    'breaking changes',
    'TypeScript',
    'JavaScript',
    'static analysis',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Dokimana — Local evidence for Stripe API changes',
    description:
      'Compare supplied Stripe OpenAPI contracts, find likely TypeScript and JavaScript call sites, and get an honest evidence report.',
    url: '/',
    siteName: 'Dokimana',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1280,
        height: 640,
        alt: 'Dokimana: local evidence for Stripe API changes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dokimana — Local evidence for Stripe API changes',
    description:
      'Local-first CLI for Stripe API change impact with evidence and explicit limits.',
    images: ['/og.png'],
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
