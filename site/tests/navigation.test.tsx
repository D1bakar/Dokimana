import { render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from '@/app/page'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe('site navigation', () => {
  it('offers an in-page contents list for every document section', () => {
    render(<HomePage />)
    const contents = screen.getByRole('navigation', { name: 'On this page' })
    const links = within(contents).getAllByRole('link')

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#what-it-is',
      '#what-it-does',
      '#limits',
      '#setup',
      '#use',
      '#difference',
    ])
  })

  it('keeps a single main landmark with the skip-link target', () => {
    render(<HomePage />)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})
