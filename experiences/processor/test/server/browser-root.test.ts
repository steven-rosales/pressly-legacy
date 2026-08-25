import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const packageRoot = process.cwd()

const sourceGraph = (entry: string): ReadonlyMap<string, string> => {
  const sources = new Map<string, string>()
  const visit = (file: string): void => {
    if (sources.has(file)) return
    const source = readFileSync(file, "utf8")
    sources.set(file, source)
    const specifiers = [
      ...source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g),
    ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue
      const target = resolve(dirname(file), specifier)
      const candidate =
        existsSync(target) && statSync(target).isFile()
          ? target
          : existsSync(`${target}.ts`)
            ? `${target}.ts`
            : existsSync(resolve(target, "index.ts"))
              ? resolve(target, "index.ts")
              : null
      if (candidate !== null) visit(candidate)
    }
  }
  visit(entry)
  return sources
}

describe("Processor browser/server package boundary", () => {
  it("publishes server assembly only from the explicit server subpath", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(packageRoot, "package.json"), "utf8")
    ) as Readonly<{ exports: Readonly<Record<string, unknown>> }>
    expect(Object.keys(manifest.exports)).toEqual([
      ".",
      "./browser",
      "./server",
      "./contracts/operational-order",
      "./contracts/authentication-v1",
      "./contracts/production-board",
      "./contracts/production-history",
      "./contracts/production-order-backlog",
      "./contracts/production-order-control",
      "./contracts/production-workspace",
      "./contracts/remaining-day-forecast",
      "./testing/browser-subscribe-changes",
    ])
    expect(JSON.stringify(manifest.exports["."])).not.toContain("server")
    expect(JSON.stringify(manifest.exports["./browser"])).toContain(
      "dist/browser.js"
    )
    expect(JSON.stringify(manifest.exports["./server"])).toContain(
      "dist/server.js"
    )
    expect(
      readFileSync(resolve(packageRoot, "src/public.ts"), "utf8")
    ).not.toMatch(/(?:from|import).*server/)
  })

  it("keeps the browser-root source graph server-free and browser-safe", () => {
    const graph = sourceGraph(resolve(packageRoot, "src/public.ts"))
    expect([...graph.keys()].some((file) => file.includes("/server"))).toBe(
      false
    )
    const source = [...graph.values()].join("\n")
    for (const forbidden of [
      "@pressly/postgres",
      "drizzle",
      "postgres",
      "node:",
    ])
      expect(source).not.toContain(forbidden)
    expect(source).not.toMatch(
      /@pressly\/production-system(?:['"]|\/(?!contracts\/))/
    )
  })

  it("keeps the explicit browser-client graph free of runtime assembly and persistence", () => {
    const graph = sourceGraph(resolve(packageRoot, "src/browser.ts"))
    const source = [...graph.values()].join("\n")
    for (const forbidden of [
      "@pressly/postgres",
      "drizzle",
      "postgres",
      "processor-server",
    ])
      expect(source).not.toContain(forbidden)
    expect(source).not.toMatch(/from\s+['"]node:/)
    expect(source).not.toMatch(
      /@pressly\/production-system(?:['"]|\/(?!contracts\/))/
    )
  })

  it("keeps the server graph free of concrete persistence and Production runtime", () => {
    const source = [
      ...sourceGraph(resolve(packageRoot, "src/server.ts")).values(),
    ].join("\n")
    for (const forbidden of [
      "@pressly/postgres",
      "drizzle",
      "postgres",
      "node:",
    ])
      expect(source).not.toContain(forbidden)
    expect(source).not.toMatch(
      /@pressly\/production-system(?:['"]|\/(?!contracts\/|capabilities\/))/
    )
  })
})
