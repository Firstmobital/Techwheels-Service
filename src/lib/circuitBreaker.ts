/**
 * Client-Side Circuit Breaker utility for Web Frontend external / edge service calls.
 * Fast-fails degraded endpoints to keep the UI responsive and prevent hanging spinners.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  name: string
  failureThreshold?: number
  cooldownMs?: number
  timeoutMs?: number
}

export class ClientCircuitBreaker {
  public readonly name: string
  private state: CircuitState = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly timeoutMs: number

  constructor(config: CircuitBreakerConfig) {
    this.name = config.name
    this.failureThreshold = config.failureThreshold ?? 3
    this.cooldownMs = config.cooldownMs ?? 20000
    this.timeoutMs = config.timeoutMs ?? 8000
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
      throw new Error(`[CircuitBreaker:${this.name}] Service temporarily unavailable. Please retry shortly.`)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const result = await operation(controller.signal)
      clearTimeout(timer)
      this.failureCount = 0
      this.state = 'CLOSED'
      return result
    } catch (error) {
      clearTimeout(timer)
      this.failureCount += 1
      this.lastFailureTime = Date.now()

      if (this.failureCount >= this.failureThreshold || this.state === 'HALF_OPEN') {
        this.state = 'OPEN'
      }

      if (fallback) {
        return await fallback()
      }
      throw error
    }
  }
}
