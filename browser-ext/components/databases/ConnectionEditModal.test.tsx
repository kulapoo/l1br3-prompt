import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => React.createElement("div", props, children),
  },
}))

import { ConnectionEditModal } from "./ConnectionEditModal"

const onSave = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  onSave.mockResolvedValue(undefined)
})

function renderCreate() {
  return render(<ConnectionEditModal mode="create" onSave={onSave} onClose={vi.fn()} />)
}

describe("ConnectionEditModal — create guided", () => {
  it("builds a postgresql url from the guided fields on save", async () => {
    renderCreate()
    // Fill guided postgres fields (PostgreSQL is the default engine for create).
    fireEvent.change(screen.getByPlaceholderText("localhost"), { target: { value: "host" } })
    fireEvent.change(screen.getByPlaceholderText("l1br3"), { target: { value: "db" } })
    fireEvent.change(screen.getByPlaceholderText("user"), { target: { value: "user" } })
    fireEvent.change(screen.getByPlaceholderText("password"), { target: { value: "pass" } })

    fireEvent.click(screen.getByRole("button", { name: /add connection/i }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
    const payload = onSave.mock.calls[0][0]
    expect(payload.engine).toBe("postgresql")
    expect(payload.url).toBe("postgresql://user:pass@host:5432/db")
  })

  it("disables save until required fields are present", () => {
    renderCreate()
    expect(screen.getByRole("button", { name: /add connection/i })).toBeDisabled()
  })
})

describe("ConnectionEditModal — create advanced", () => {
  it("uses the pasted connection string verbatim", async () => {
    renderCreate()
    fireEvent.click(screen.getByRole("button", { name: "Connection string" }))
    const input = await screen.findByPlaceholderText("postgresql://user:pass@host:5432/db")
    fireEvent.change(input, { target: { value: "postgresql://u:p@h:5432/d" } })
    fireEvent.click(screen.getByRole("button", { name: /add connection/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].url).toBe("postgresql://u:p@h:5432/d")
  })
})

describe("ConnectionEditModal — edit label-only", () => {
  it("omits url when only the label changes (edit mode, no new password)", async () => {
    render(
      <ConnectionEditModal
        mode="edit"
        initial={{
          id: "x",
          label: "Work Postgres",
          engine: "postgresql",
          hasPassword: true,
          host: "host",
          port: 5432,
          database: "db",
          maskedUrl: "postgresql://user:***@host:5432/db",
          isActive: false,
          isDefault: false,
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText("e.g. My Postgres, Work DB"), { target: { value: "Renamed" } })
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const payload = onSave.mock.calls[0][0]
    expect(payload.label).toBe("Renamed")
    expect(payload.url).toBeUndefined()
  })
})
