/** Rejects with `TimeoutError` when `promise` takes longer than `ms`. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Per-request budget for optional SSR data on public pages (spec: 2.5 s). */
export const SSR_DATA_TIMEOUT_MS = 2500
