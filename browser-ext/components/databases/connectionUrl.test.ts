/**
 * Tests for the guided-form → connection-string builder (Milestone 3).
 *
 * The builder is a pure function so the URL-construction logic (including
 * credential URL-encoding) is verified independently of the modal UI.
 */
import { describe, it, expect } from "vitest"
import { buildConnectionString, type GuidedFields } from "./connectionUrl"

const pg: GuidedFields = { host: "", port: "", database: "", username: "", password: "", path: "" }

describe("buildConnectionString — sqlite", () => {
  it("builds an absolute-path url (4 slashes, matches backend convention)", () => {
    expect(buildConnectionString("sqlite", { ...pg, path: "/home/me/l1br3.db" })).toBe("sqlite:////home/me/l1br3.db")
  })

  it("builds a relative-path url (3 slashes)", () => {
    expect(buildConnectionString("sqlite", { ...pg, path: "data/l1br3.db" })).toBe("sqlite:///data/l1br3.db")
  })

  it("falls back to in-memory when path is blank", () => {
    expect(buildConnectionString("sqlite", { ...pg, path: "   " })).toBe("sqlite://")
  })
})

describe("buildConnectionString — postgresql", () => {
  it("builds a full url with credentials", () => {
    expect(
      buildConnectionString("postgresql", {
        ...pg,
        host: "host",
        port: "5432",
        database: "db",
        username: "user",
        password: "pass",
      }),
    ).toBe("postgresql://user:pass@host:5432/db")
  })

  it("omits the password segment when blank", () => {
    expect(
      buildConnectionString("postgresql", {
        ...pg,
        host: "host",
        port: "5432",
        database: "db",
        username: "user",
        password: "",
      }),
    ).toBe("postgresql://user@host:5432/db")
  })

  it("omits auth entirely when no username", () => {
    expect(buildConnectionString("postgresql", { ...pg, host: "host", port: "5432", database: "db" })).toBe(
      "postgresql://host:5432/db",
    )
  })

  it("defaults host to localhost", () => {
    expect(buildConnectionString("postgresql", { ...pg, port: "5432", database: "db" })).toBe(
      "postgresql://localhost:5432/db",
    )
  })

  it("url-encodes special characters in credentials", () => {
    const url = buildConnectionString("postgresql", {
      ...pg,
      host: "host",
      port: "5432",
      database: "db",
      username: "u@ser",
      password: "p@ss:word",
    })
    expect(url).toBe("postgresql://u%40ser:p%40ss%3Aword@host:5432/db")
  })
})
