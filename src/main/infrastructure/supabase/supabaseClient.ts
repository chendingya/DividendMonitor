import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionFileStorage } from '@main/infrastructure/supabase/sessionStorage'

let client: SupabaseClient | null = null

function getSupabaseConfig() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_ANON_KEY']

  if (url && key) {
    return { url, key }
  }

  return null
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client

  const config = getSupabaseConfig()
  if (!config) return null

  client = createClient(config.url, config.key, {
    auth: {
      storage: sessionFileStorage,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  })

  return client
}

export function resetSupabaseClient(): void {
  client = null
}
