'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from './search'
import { ThemeToggle } from './theme-toggle'

const navLinks = [
  { href: '/method', label: 'Method' },
  { href: '/safety', label: 'Safety' },
  { href: '/docs', label: 'Docs' },
]

export function Nav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  return (
    <header className="site-header" role="banner">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="ApiProof home">
          ApiProof
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Search />
          <Link
            href="/quickstart"
            className="button button--solid header-install"
            aria-current={pathname === '/quickstart' ? 'page' : undefined}
          >
            Install CLI
          </Link>
          <ThemeToggle />
          <button
            type="button"
            className={menuOpen ? 'menu-button menu-button--open' : 'menu-button'}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? 'mobile-menu' : undefined}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="hamburger" aria-hidden="true"></span>
            <span className="hamburger" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div id="mobile-menu" className="mobile-menu">
          <nav aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="mobile-link"
                aria-current={pathname === link.href ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/about" className="mobile-link">
              About
            </Link>
            <Link href="/contact" className="mobile-link">
              Contact
            </Link>
            <Link href="/quickstart" className="mobile-link mobile-link--cta">
              Install CLI
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
