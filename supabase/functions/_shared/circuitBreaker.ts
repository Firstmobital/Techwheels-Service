/**
 * Circuit Breaker pattern implementation for external third-party dependencies
 * (e.g. IDSPay RTO API, Meta WhatsApp Graph API, Resend Email API, Google Drive API).
 *
 * Prevents cascading thread/connection exhaustion by failing fast when a downstream
 * service is degraded, and automatically recovering after a cooldown window.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  name: string
  failureThreshold?: number // Number of consecutive failures before opening circuit (default 4)
  cooldownMs?: number // Milliseconds before transitioning from OPEN to HALF_OPEN (default 30000)
  timeoutMs?: number // Timeout for the wrapped fetch operation (default 6000)
}

export class CircuitBreaker {
  public name: string
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private failureThreshold: number
  private cooldownMs: number
  private timeoutMs: number

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name
    this.failureThreshold = options.failureThreshold ?? 4
    this.cooldownMs = options.cooldownMs ?? 30000
    this.timeoutMs = options.timeoutMs ?? 6000
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now()
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.state = 'HALF_OPEN'
      }
    }
    return this.state
  }

  public async execute<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    fallback?: () => Promise<T> | T,
  ): Promise<T> {
    const currentState = this.getState()

    if (currentState === 'OPEN') {
      if (fallback) {
        return await fallback()
      }
      throw new Error(`[CircuitBreaker:${this.name}] Circuit is OPEN. Fast-failing request.`)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const result = await operation(controller.signal)
      clearTimeout(timer)
      this.onSuccess()
      return result
    } catch (error) {
      clearTimeout(timer)
      this.onFailure(error)

      if (fallback) {
        return await fallback()
      }
      throw error
    }
  }

  private onSuccess() {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  private onFailure(error: unknown) {
    this.failureCount += 1
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN'
      console.warn(`[CircuitBreaker:${this.name}] Tripped to OPEN state after ${this.failureCount} failures. Error:`, error)
    }
  }
}

// Global registry of singleton circuit breakers for Edge Functions
const registry = new Map<string, CircuitBreaker>()

export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  let cb = registry.get(options.name)
  if (!cb) {
    cb = new CircuitBreaker(options)
    registry.set(options.name, cb)
  }
  return cb
}
