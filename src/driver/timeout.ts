// Reject if `promise` doesn't settle within `ms`. Used to bound OpenCode prompts so
// a hung agent session can't pin an assessment "running" forever — which would block
// every future assessment (#48). The underlying request may keep running, but the
// caller is freed to surface an error and let the operator retry.

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}
