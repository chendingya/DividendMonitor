import type { ProviderKey } from '@main/infrastructure/dataSources/types/sourceTypes'

type CircuitState = 'closed' | 'open' | 'half-open'

type CircuitEntry = {
  state: CircuitState
  failureCount: number
  openedAt: number
  lastFailureAt: number
}

const FAILURE_THRESHOLD = 3
const COOLDOWN_MS = 30_000

export class CircuitBreaker {
  private readonly circuits = new Map<ProviderKey, CircuitEntry>()

  async beforeRequest(provider: ProviderKey): Promise<void> {
    const entry = this.circuits.get(provider)
    if (!entry || entry.state === 'closed') return

    if (entry.state === 'open') {
      const elapsed = Date.now() - entry.openedAt
      if (elapsed >= COOLDOWN_MS) {
        // Transition to half-open — allow one probe
        entry.state = 'half-open'
        return
      }
      throw new Error(`Circuit open for ${provider}, cooldown ${Math.ceil((COOLDOWN_MS - elapsed) / 1000)}s remaining`)
    }

    // half-open: allow the probe request through
  }

  recordSuccess(provider: ProviderKey): void {
    this.circuits.set(provider, {
      state: 'closed',
      failureCount: 0,
      openedAt: 0,
      lastFailureAt: 0
    })
  }

  recordFailure(provider: ProviderKey): void {
    const entry = this.circuits.get(provider) ?? this.emptyEntry()
    entry.failureCount += 1
    entry.lastFailureAt = Date.now()

    if (entry.state === 'half-open') {
      // Probe failed — back to open
      entry.state = 'open'
      entry.openedAt = Date.now()
      this.circuits.set(provider, entry)
      return
    }

    if (entry.failureCount >= FAILURE_THRESHOLD) {
      entry.state = 'open'
      entry.openedAt = Date.now()
    }

    this.circuits.set(provider, entry)
  }

  getState(provider: ProviderKey): CircuitState {
    return this.circuits.get(provider)?.state ?? 'closed'
  }

  reset(provider?: ProviderKey): void {
    if (provider) {
      this.circuits.delete(provider)
    } else {
      this.circuits.clear()
    }
  }

  private emptyEntry(): CircuitEntry {
    return {
      state: 'closed',
      failureCount: 0,
      openedAt: 0,
      lastFailureAt: 0
    }
  }
}
