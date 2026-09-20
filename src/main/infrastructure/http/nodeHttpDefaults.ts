import { EventEmitter } from 'node:events'
import http from 'node:http'
import https from 'node:https'

/** Only the desktop/headless entry point configures Node's connection pool. */
export function installNodeHttpDefaults(): void {
  EventEmitter.defaultMaxListeners = 50
  http.globalAgent.maxSockets = 16
  https.globalAgent.maxSockets = 16
}
