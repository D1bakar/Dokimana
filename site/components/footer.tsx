import Link from 'next/link'

const commands = [
  { label: 'scan', href: '/quickstart#scan', desc: 'Diff inputs and scan call sites' },
  { label: 'report', href: '/quickstart#report', desc: 'Write Markdown evidence' },
  { label: 'verify', href: '/quickstart#verify', desc: 'Check verification status' },
  { label: 'doctor', href: '/quickstart#doctor', desc: 'Key-safety check' },
]

export function Footer() {
  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link href="/" className="brand">
            ApiProof
          </Link>
          <p>Stripe API change evidence for TypeScript and JavaScript repositories.</p>
        </div>
        <nav className="footer-nav" aria-label="Footer">
          <div className="footer-col">
            <h3>Product</h3>
            <Link href="/method">Method</Link>
            <Link href="/safety">Safety</Link>
            <Link href="/quickstart">Quick start</Link>
            <Link href="/docs">Docs</Link>
          </div>
          <div className="footer-col">
            <h3>Project</h3>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link
              href="https://github.com/D1bakar/Dokimana"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code
            </Link>
            <Link
              href="https://github.com/D1bakar/Dokimana/blob/main/README.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Project README
            </Link>
          </div>
          <div className="footer-col">
            <h3>CLI commands</h3>
            {commands.map((cmd) => (
              <Link key={cmd.label} href={cmd.href}>
                {cmd.label}
                <span className="command-desc">{cmd.desc}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
      <div className="footer-base">
        <span>MIT licensed</span>
        <span>No live Stripe calls</span>
        <span>Verification runner not configured</span>
      </div>
    </footer>
  )
}
