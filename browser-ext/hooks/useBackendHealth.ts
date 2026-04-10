import { useEffect, useRef } from 'react'
import { pingBackend } from '../lib/api'
import { useAppConfig } from '../contexts/AppConfig'

const POLL_INTERVAL_MS = 30_000
// Number of consecutive failures required before flipping isInstalled true → false.
// Single failures (a brief stall, a sleeping laptop) shouldn't tear down the
// connected state — wait for a confirmed pattern.
const FAILURE_THRESHOLD = 2

/**
 * Live-detect whether the local backend is reachable.
 *
 * Mount this once at the app root. It pings `${backend.url}/api/v1/health`
 * on mount, on URL change, every POLL_INTERVAL_MS, and whenever the OS
 * reports the network has come back online. The result is written into
 * `config.backend.isInstalled` so the rest of the UI can react.
 *
 * The flag is debounced on the way down (true → false requires
 * FAILURE_THRESHOLD consecutive failures) so a single dropped ping doesn't
 * tear down the connected UI.
 */
export function useBackendHealth(): void {
  const { config, updateConfig } = useAppConfig()
  const url = config.backend.url
  const isInstalled = config.backend.isInstalled

  // Track consecutive failures across renders without retriggering effects.
  const failureCountRef = useRef(0)
  // Always read the latest values from inside async callbacks.
  const isInstalledRef = useRef(isInstalled)
  const updateConfigRef = useRef(updateConfig)
  const configRef = useRef(config)
  isInstalledRef.current = isInstalled
  updateConfigRef.current = updateConfig
  configRef.current = config

  useEffect(() => {
    let cancelled = false

    const check = async (): Promise<void> => {
      const ok = await pingBackend(url)
      if (cancelled) return

      if (ok) {
        failureCountRef.current = 0
        if (!isInstalledRef.current) {
          updateConfigRef.current({
            backend: { ...configRef.current.backend, isInstalled: true },
          })
        }
        return
      }

      failureCountRef.current += 1
      if (
        isInstalledRef.current &&
        failureCountRef.current >= FAILURE_THRESHOLD
      ) {
        updateConfigRef.current({
          backend: { ...configRef.current.backend, isInstalled: false },
        })
      } else if (!isInstalledRef.current) {
        // Already disconnected — keep it that way without re-rendering.
      }
    }

    // Fire immediately so the UI doesn't sit on a stale flag after hydration.
    void check()

    const interval = window.setInterval(() => {
      void check()
    }, POLL_INTERVAL_MS)

    const handleOnline = (): void => {
      // Network just came back — re-check straight away rather than waiting
      // out the rest of the polling interval.
      failureCountRef.current = 0
      void check()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('online', handleOnline)
    }
  }, [url])
}
