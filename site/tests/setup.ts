import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

function getStorage(): Storage {
  try {
    if (window.localStorage) return window.localStorage
  } catch {
    // Access can throw for opaque origins.
  }

  const store = new Map<string, string>()
  const fallback: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  }

  Object.defineProperty(window, 'localStorage', { value: fallback, configurable: true })
  return fallback
}

const storage = getStorage()

afterEach(() => {
  cleanup()
  storage.clear()
  document.documentElement.className = ''
})

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}
