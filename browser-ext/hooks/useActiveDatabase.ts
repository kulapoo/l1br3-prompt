import { useQuery } from "@tanstack/react-query"
import { useAppConfig } from "../contexts/AppConfig"
import { listDatabases } from "../lib/api"
import type { DatabaseConnectionRead } from "../types"

export interface UseActiveDatabaseReturn {
  activeConnection: DatabaseConnectionRead | null
  /** True when the active connection's URL can't be decrypted (rotated master key). */
  isUndecryptable: boolean
  isLoading: boolean
}

/**
 * Resolves the active database connection + its decrypt status, for the sidebar
 * fallback banner. Mirrors the `usePrompts` React Query pattern.
 */
export function useActiveDatabase(): UseActiveDatabaseReturn {
  const { config } = useAppConfig()
  const backendUrl = config.backend.url

  const query = useQuery({
    queryKey: ["databases", "active"],
    queryFn: async () => listDatabases(backendUrl),
    enabled: config.backend.isInstalled,
  })

  const activeConnection = query.data?.find((c) => c.isActive) ?? null
  return {
    activeConnection,
    isUndecryptable: activeConnection?.undecryptable === true,
    isLoading: query.isLoading,
  }
}
