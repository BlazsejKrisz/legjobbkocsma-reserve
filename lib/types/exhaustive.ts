/**
 * Exhaustiveness helper for switch statements.  Used in the `default`
 * branch of a switch over a union type so the compiler errors when a
 * new variant is added but not handled.
 *
 *   switch (status) {
 *     case 'sent':    return <Check />
 *     case 'pending': return <Clock />
 *     // … all other cases …
 *     default:        return assertNever(status)  // ← compile error if a case is missing
 *   }
 *
 * At runtime, throws — so a sloppy cast that lets a value through still
 * surfaces loudly rather than silently rendering nothing.
 */
export function assertNever(x: never, label = 'value'): never {
  throw new Error(`Unexpected ${label}: ${JSON.stringify(x)}`)
}
