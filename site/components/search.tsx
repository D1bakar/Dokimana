'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { filterSearchItems } from '@/lib/search-data'

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.8 12.8 17 17" />
    </svg>
  )
}

export function Search() {
  const router = useRouter()
  const listId = useId()
  const dialogId = useId()
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [shortcut, setShortcut] = useState('')

  const results = useMemo(() => filterSearchItems(query), [query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
    triggerRef.current?.focus()
  }, [])

  const openSearch = useCallback(() => {
    setOpen(true)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      setActiveIndex(0)
      router.push(href)
    },
    [router],
  )

  useEffect(() => {
    const isMac = /mac|iphone|ipad/i.test(navigator.userAgent)
    setShortcut(isMac ? '⌘K' : 'Ctrl K')
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) close()
        else openSearch()
        return
      }

      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        openSearch()
        return
      }

      if (event.key === 'Escape' && open) {
        close()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close, openSearch])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % Math.max(results.length, 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(
        (index) => (index - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1),
      )
      return
    }

    if (event.key === 'Enter') {
      const item = results[activeIndex]
      if (item) {
        event.preventDefault()
        go(item.href)
      }
      return
    }

    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, input, [href], [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="search-trigger"
        onClick={openSearch}
        aria-label="Search the site"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
      >
        <SearchIcon />
        <span className="search-label">Search</span>
        {shortcut ? (
          <kbd className="search-kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        ) : null}
      </button>

      {open ? (
        <div
          className="search-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            ref={dialogRef}
            id={dialogId}
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={onDialogKeyDown}
          >
            <h2 id={titleId} className="visually-hidden">
              Search the site
            </h2>
            <div className="search-head">
              <SearchIcon />
              <input
                ref={inputRef}
                type="text"
                className="search-input"
                placeholder="Search commands, guides, and limits…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={query.trim().length > 0}
                aria-controls={query.trim() ? listId : undefined}
                aria-activedescendant={
                  results.length > 0 ? `${listId}-option-${activeIndex}` : undefined
                }
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="search-close"
                onClick={close}
                aria-label="Close search"
              >
                Close
              </button>
            </div>

            {query.trim() ? (
              <ul className="search-list" id={listId} role="listbox" aria-label="Search results">
                {results.map((item, index) => (
                  <li key={item.href} role="presentation">
                    <button
                      type="button"
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      className="search-option"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(item.href)}
                    >
                      <span className="search-option-title">{item.title}</span>
                      <span className="search-option-preview">{item.preview}</span>
                      <span className="search-option-category">{item.category}</span>
                    </button>
                  </li>
                ))}
                {results.length === 0 ? (
                  <li className="search-empty">No matches for “{query.trim()}”.</li>
                ) : null}
              </ul>
            ) : (
              <p className="search-hint">
                Search for a command such as <strong>scan</strong>, a boundary such as{' '}
                <strong>keys</strong>, or a page such as <strong>method</strong>.
              </p>
            )}

            <div className="search-foot" aria-hidden="true">
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
