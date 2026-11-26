import type { Metadata } from 'next'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import '@/app/globals.css'
import '@/app/components.css'

const themeScript = `(function(){try{var stored=localStorage.getItem('apiproof-theme');var dark=stored==='dark'||(stored!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch(e){}})();`

export const metadata: Metadata = {
  title: {
    default: 'ApiProof — Trace Stripe API changes to likely call sites',
    template: '%s — ApiProof',
  },
  description:
    'ApiProof compares supplied Stripe OpenAPI contracts and finds likely TypeScript/JavaScript call-site impact. Local-first CLI, no live Stripe calls.',
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
    title: 'ApiProof — Trace Stripe API changes to likely call sites',
    description:
      'Compare supplied Stripe OpenAPI contracts, find likely TypeScript and JavaScript call sites, and get an honest evidence report.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ApiProof — Trace Stripe API changes to likely call sites',
    description:
      'Compare supplied Stripe OpenAPI contracts and find likely TypeScript and JavaScript call-site impact.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
