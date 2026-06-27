import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConnectionCard } from "./ConnectionCard"
import { ENGINE_META } from "./engineMeta"
import type { DatabaseConnectionRead } from "../../types"

const base: DatabaseConnectionRead = {
  id: "x",
  label: "Prod",
  engine: "postgresql",
  hasPassword: true,
  host: "h",
  port: 5432,
  database: "db",
  maskedUrl: "postgresql://u:***@h:5432/db",
  isActive: false,
  isDefault: false,
}

describe("ConnectionCard — undecryptable flag", () => {
  it("shows an Undecryptable badge when connection.undecryptable is true", () => {
    render(<ConnectionCard meta={ENGINE_META.postgresql} connection={{ ...base, undecryptable: true }} />)
    expect(screen.getByText(/undecryptable/i)).toBeTruthy()
  })

  it("does not show the badge when undecryptable is absent", () => {
    render(<ConnectionCard meta={ENGINE_META.postgresql} connection={base} />)
    expect(screen.queryByText(/undecryptable/i)).toBeNull()
  })
})
