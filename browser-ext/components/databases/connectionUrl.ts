import type { DbEngine } from "../../types"

export interface GuidedFields {
  host: string
  port: string
  database: string
  username: string
  password: string
  /** File path, used only by the SQLite guided form. */
  path: string
}

/**
 * Build a SQLAlchemy connection string from guided-form fields.
 *
 * SQLite → `sqlite:///<path>` (in-memory when blank). PostgreSQL → a standard
 * `postgresql://[user[:pass]@]host[:port][/db]` URL, with credentials
 * percent-encoded so special characters don't break parsing.
 */
export function buildConnectionString(engine: DbEngine, f: GuidedFields): string {
  if (engine === "sqlite") {
    const p = f.path.trim()
    return p ? `sqlite:///${p}` : "sqlite://"
  }

  const username = f.username.trim()
  const password = f.password.trim()
  const auth = username ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@` : ""
  const host = f.host.trim() || "localhost"
  const port = f.port.trim() ? `:${f.port.trim()}` : ""
  const database = f.database.trim()
  return `postgresql://${auth}${host}${port}${database ? `/${database}` : ""}`
}
