import type { DbEngine } from "../../types"

export interface EngineMeta {
  engine: DbEngine
  label: string
  description: string
  defaultPort: number | null
  /** Whether this engine exposes the advanced "paste connection string" mode. */
  supportsConnectionString: boolean
  /** Fixed engines (the default SQLite) cannot be added/edited/deleted. */
  fixed?: boolean
}

export const ENGINE_META: Record<DbEngine, EngineMeta> = {
  sqlite: {
    engine: "sqlite",
    label: "SQLite",
    description: "Zero-config local file. The shipped default — your data stays on this machine.",
    defaultPort: null,
    supportsConnectionString: true,
    fixed: true,
  },
  postgresql: {
    engine: "postgresql",
    label: "PostgreSQL",
    description: "Connect to your own Postgres server. Bring-your-own database for backups & multi-machine use.",
    defaultPort: 5432,
    supportsConnectionString: true,
  },
}

/** Engines a user can add a new connection for. */
export const ADDABLE_ENGINES: DbEngine[] = ["postgresql", "sqlite"]

/** Display order (the default SQLite always shows first). */
export const ENGINE_ORDER: DbEngine[] = ["sqlite", "postgresql"]
