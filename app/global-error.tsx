'use client'

import { useEffect } from 'react'

// Last-resort fallback for errors thrown above the dashboard layout
// (e.g. in app/layout.tsx or root segment).  Must define <html> + <body>
// because it replaces the root layout entirely.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#0a0a0a',
          color: '#fafafa',
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Application error
          </h1>
          <p style={{ color: '#a1a1aa', marginBottom: '1rem' }}>
            Something went wrong loading the page.
          </p>
          {error.digest && (
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#71717a', marginBottom: '1rem' }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #27272a',
              borderRadius: '0.375rem',
              background: 'transparent',
              color: '#fafafa',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
