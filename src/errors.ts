export type WarnOnce = (category: string, message: string) => void

export function createWarnOnce(debug: boolean): WarnOnce {
  const seen = new Set<string>()
  return (category, message) => {
    if (!debug || seen.has(category)) return
    seen.add(category)
    console.warn(`[doclight] ${message}`)
  }
}

export async function safeResolve<T>(
  fn: () => Promise<T>,
  onError: (err: unknown) => void,
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    onError(err)
    return undefined
  }
}
