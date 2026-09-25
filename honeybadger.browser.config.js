import { Honeybadger } from '@honeybadger-io/react'
import {
  isHoneybadgerBrowserEnabled,
  isHoneybadgerTransportNoise,
} from './src/lib/honeybadgerShared.js'

const enabled = isHoneybadgerBrowserEnabled()

export const config = {
  apiKey: enabled ? process.env.NEXT_PUBLIC_HONEYBADGER_API_KEY : undefined,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  revision: process.env.NEXT_PUBLIC_HONEYBADGER_REVISION,
  projectRoot: 'webpack://_N_E/./',
  // Force off unless the explicit public flag is set in production.
  reportData: enabled,
  ignoreBrowserExtensionErrors: true,
  // Per-page load cap (browser SDK); final flood safety net.
  maxErrors: 10,
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
  Honeybadger.logger.debug('Honeybadger configured for browser')
}
