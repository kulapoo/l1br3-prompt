import { useEffect, useRef } from 'react'
import { fetchAiStatus } from '../lib/api'
import { useAppConfig } from '../contexts/AppConfig'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Background quota poller for the cloud AI fallback.
 *
 * When cloud is enabled and the backend is reachable, fetches /ai/status?cloud=true
 * every 5 minutes (and immediately on mount / when cloud is first enabled) to keep
 * the quota display in SettingsTab fresh.
 *
 * After any generate call the caller should trigger a manual refresh by calling
 * refresh() from the returned object — this hook just handles background polling.
 */
export function useCloudQuota(): void {
  const { config, updateConfig } = useAppConfig()
  const cloudEnabled = config.ai.cloudEnabled
  const backendInstalled = config.backend.isInstalled
  const backendUrl = config.backend.url
  const deviceId = config.ai.deviceId

  const updateConfigRef = useRef(updateConfig)
  const configRef = useRef(config)
  updateConfigRef.current = updateConfig
  configRef.current = config

  useEffect(() => {
    if (!cloudEnabled || !backendInstalled || !deviceId) return

    let cancelled = false

    const refresh = async (): Promise<void> => {
      try {
        const status = await fetchAiStatus(backendUrl, { deviceId, includeCloud: true })
        if (cancelled) return
        if (status.cloud) {
          updateConfigRef.current({
            ai: {
              ...configRef.current.ai,
              cloudQuotaRemaining: status.cloud.quotaRemaining,
              cloudQuotaTotal: status.cloud.quotaTotal,
              cloudQuotaResetAt: status.cloud.resetAt,
            },
          })
        }
      } catch {
        // Backend unreachable — silently skip; useBackendHealth handles the UI
      }
    }

    void refresh()
    const interval = window.setInterval(() => { void refresh() }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [cloudEnabled, backendInstalled, backendUrl, deviceId])
}
