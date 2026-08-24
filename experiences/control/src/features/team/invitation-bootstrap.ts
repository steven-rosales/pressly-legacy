export function consumeInvitationToken(
  location: Readonly<{ hash: string; pathname: string; search: string }>,
  replaceLocation: (path: string) => void,
): string | null {
  if (!location.hash.startsWith("#")) return null

  const parameters = new URLSearchParams(location.hash.slice(1))
  const token = parameters.get("invite")
  if (token === null) return null

  parameters.delete("invite")
  const remaining = parameters.toString()
  replaceLocation(
    `${location.pathname}${location.search}${remaining.length === 0 ? "" : `#${remaining}`}`,
  )

  return token.length >= 32 && token.length <= 512 ? token : null
}
