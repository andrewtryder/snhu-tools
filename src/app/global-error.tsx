'use client'; // Error components must be Client Components

import { useEffect } from 'react'
import { Honeybadger } from '@honeybadger-io/react'
import {
  isHoneybadgerBrowserEnabled,
  isHoneybadgerTransportNoise,
} from '@/lib/honeybadgerShared.js'

/**
 * error.[js|tsx]: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 * global-error.[js|tsx]: https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-layouts
 *
 * This component is called when:
 *  - on the server, when data fetching methods throw or reject
 *  - on the client, when getInitialProps throws or rejects
 *  - on the client, when a React lifecycle method (render, componentDidMount, etc) throws or rejects
 *      and was caught by the built-in Next.js error boundary
 *
 * Honeybadger notify here is the official @honeybadger-io/nextjs App Router path.
 * Server onRequestError intentionally does not also notify (avoids duplicates).
 */
export default function Error({
  error,
  reset,
}: {
    error: Error;
    reset: () => void;
}) {
  useEffect(() => {
    if (!isHoneybadgerBrowserEnabled() || isHoneybadgerTransportNoise(error)) {
      return
    }
    try {
      Honeybadger.notify(error)
    } catch {
      // Monitoring failures must never break the error UI.
    }
  }, [error])

  return (
    <html lang="en">
      <body>
        <div>
          <h2>Something went wrong!</h2>
          <button
            onClick={
              // Attempt to recover by trying to re-render the segment
              () => reset()
            }
          >
                    Try again
          </button>
        </div>
      </body>
    </html>
  )
}
