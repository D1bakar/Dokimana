import { fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Nav } from '@/components/nav'
import { Search } from '@/components/search'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/method',
  useRouter: () => ({ push }),
}))

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
  beforeEach(() => {
    push.mockClear()
  })

  it('opens and closes the mobile menu with the menu button and Escape', () => {
    render(<Nav />)
    const toggle = screen.getByRole('button', { name: 'Open menu' })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const mobileNav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(within(mobileNav).getByRole('link', { name: 'Install CLI' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument()
  })

  it('marks the current route in the primary navigation', () => {
    render(<Nav />)
    const primary = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(primary).getByRole('link', { name: 'Method' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(primary).getByRole('link', { name: 'Safety' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('opens search with the keyboard, filters results, and navigates with Enter', () => {
    render(<Search />)
    fireEvent.keyDown(document, { key: 'k', metaKey: true })

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'likely call sites' } })

    const results = screen.getByRole('listbox', { name: 'Search results' })
    expect(within(results).getByText('scan command')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/quickstart#scan')
  })

  it('closes search on Escape and returns focus to the trigger', () => {
    render(<Search />)
    const trigger = screen.getByRole('button', { name: 'Search the site' })
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Search the site' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
