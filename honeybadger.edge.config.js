import Honeybadger from '@honeybadger-io/js'
import {
  isHoneybadgerEnabled,
  isHoneybadgerTransportNoise,
} from './src/lib/honeybadgerShared.js'

const enabled = isHoneybadgerEnabled()
const apiKey = enabled
  ? (process.env.HONEYBADGER_API_KEY || process.env.NEXT_PUBLIC_HONEYBADGER_API_KEY)
  : undefined

export const config = {
  apiKey,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  revision: process.env.NEXT_PUBLIC_HONEYBADGER_REVISION,
  projectRoot: 'webpack://_N_E/./',
  // Force off unless HONEYBADGER_ENABLED=true in production.
  reportData: enabled,
}

Honeybadger.configure(config)

Honeybadger.beforeNotify((notice) => {
  if (!notice) {
    return false
  }
  if (!enabled || isHoneybadgerTransportNoise(notice.message)) {
    return false
  }
})

if (enabled) {
  Honeybadger.logger.debug('Honeybadger configured for edge')
}
