'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function CodeBlock({ code }: { code: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [])

  const copy = useCallback(async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }

    if (timeout.current) clearTimeout(timeout.current)
    timeout.current = setTimeout(() => setStatus('idle'), 1800)
  }, [code])

  return (
    <figure className="code-block">
      <pre>
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="copy-button"
        aria-label="Copy code to clipboard"
      >
        <span aria-live="polite">
          {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
        </span>
      </button>
    </figure>
  )
}
