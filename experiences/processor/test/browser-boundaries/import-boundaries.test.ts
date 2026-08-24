import { readdirSync, readFileSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const sourceRoot = resolve(process.cwd(), "src")

const sourceFiles = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : []
  })

describe("Processor browser ownership boundaries", () => {
  const files = sourceFiles(sourceRoot)

  it("contains no app mirror or framework entrypoint", () => {
    const relativeFiles = files.map((file) =>
      relative(sourceRoot, file).replaceAll("\\", "/")
    )

    expect(relativeFiles).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/(?:^|\/)application\//),
        "main.tsx",
      ])
    )
  })

  it("keeps host and process lifecycle imports out of Experience source", () => {
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return /(?:from\s+|import\s*\()["'](?:@pressly\/(?:processor-browser-host|topology)|(?:\.\.\/)+hosts\/)/.test(
        source
      )
        ? [relative(sourceRoot, file).replaceAll("\\", "/")]
        : []
    })

    expect(violations).toEqual([])
  })

  it("keeps feature presentation out of concrete browser adapters", () => {
    const violations = files
      .filter((file) => file.includes("/browser/adapters/"))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8")
        return /(?:from\s+|import\s*\()["'][^"']*(?:features|browser\/shell|browser\/components)\//.test(
          source
        )
          ? [relative(sourceRoot, file).replaceAll("\\", "/")]
          : []
      })

    expect(violations).toEqual([])
  })
})
