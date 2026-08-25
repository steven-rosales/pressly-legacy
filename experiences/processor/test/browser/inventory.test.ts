import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const packageRoot = process.cwd()

describe("Processor browser-client inventory", () => {
  it("publishes one explicit browser subpath", () => {
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
    expect(JSON.stringify(manifest.exports["./browser"])).toContain(
      "dist/browser.js"
    )
  })

  it("contains exactly four auth and four live Orders operation identities", () => {
    const authentication = readFileSync(
      resolve(packageRoot, "src/browser/authentication/types.ts"),
      "utf8"
    )
    const orders = readFileSync(
      resolve(packageRoot, "src/browser/orders/types.ts"),
      "utf8"
    )

    expect(authentication.match(/GeneratedBrowserOperation</g)).toHaveLength(4)
    expect(orders.match(/GeneratedBrowserOperation</g)).toHaveLength(4)
    for (const operationId of [
      "orders.list-incoming-order-proposals.v1",
      "orders.accept-incoming-order-proposal.v1",
      "orders.reject-incoming-order-proposal.v1",
      "orders.restore-incoming-order-proposal.v1",
    ])
      expect(orders).toContain(operationId)
    for (const serverOnlyMethod of [
      "releaseFulfillment",
      "withdrawFulfillment",
      "createOrder",
      "correctOrder",
      "completeOrder",
      "cancelOrder",
    ])
      expect(orders).not.toContain(serverOnlyMethod)
  })

  it("uses only serialized owner schemas and the narrow Orders HTTP subpath", () => {
    const source = [
      "src/browser/authentication/client.ts",
      "src/browser/authentication/types.ts",
      "src/browser/orders/client.ts",
      "src/browser/orders/types.ts",
    ]
      .map((file) => readFileSync(resolve(packageRoot, file), "utf8"))
      .join("\n")

    expect(source).not.toMatch(/from ['"]\.\.\/\.\.\/server\//)
    expect(source).not.toMatch(/@pressly\/orders-system['"]/)
    expect(source).toContain("@pressly/orders-system/http/order-management")
    expect(source).toContain("../../contracts/authentication-v1.ts")
    expect(source).not.toContain("Date")
  })
})
