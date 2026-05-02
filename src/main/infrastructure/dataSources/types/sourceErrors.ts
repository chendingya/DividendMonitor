import type { ProviderKey } from '@main/infrastructure/dataSources/types/sourceTypes'

export type SourceErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_4XX'
  | 'UPSTREAM_5XX'
  | 'PARSE_FAILED'
  | 'CIRCUIT_OPEN'
  | 'NO_FALLBACK_AVAILABLE'
  | 'UNSUPPORTED_CAPABILITY'

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly code: SourceErrorCode,
    public readonly provider: ProviderKey,
    public readonly endpointId: string,
    public readonly retryable: boolean,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'SourceError'
  }
}

export function toSourceError(error: unknown, provider: ProviderKey, endpointId: string): SourceError {
  if (error instanceof SourceError) {
    return error
  }

  if (error instanceof Error) {
    const message = error.message
    if (/HTTP 4\d\d/.test(message)) {
      return new SourceError(message, 'UPSTREAM_4XX', provider, endpointId, false, error)
    }
    if (/HTTP 5\d\d/.test(message)) {
      return new SourceError(message, 'UPSTREAM_5XX', provider, endpointId, true, error)
    }
    if (/timeout/i.test(message)) {
      return new SourceError(message, 'TIMEOUT', provider, endpointId, true, error)
    }
    if (/NETWORK/i.test(message)) {
      return new SourceError(message, 'NETWORK', provider, endpointId, true, error)
    }
    return new SourceError(message, 'PARSE_FAILED', provider, endpointId, false, error)
  }

  return new SourceError(`Unknown source error for ${endpointId}`, 'NETWORK', provider, endpointId, true, error)
}
