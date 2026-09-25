import Honeybadger from '@honeybadger-io/js'
import {
  isHoneybadgerEnabled,
  isHoneybadgerTransportNoise,
} from './src/lib/honeybadgerShared.js'

const projectRoot = process.cwd()
const enabled = isHoneybadgerEnabled()
const apiKey = enabled
  ? (process.env.HONEYBADGER_API_KEY || process.env.NEXT_PUBLIC_HONEYBADGER_API_KEY)
  : undefined

export const config = {
  apiKey,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  revision: process.env.NEXT_PUBLIC_HONEYBADGER_REVISION,
  projectRoot: 'webpack:///./',
  // Force off unless HONEYBADGER_ENABLED=true in production.
  reportData: enabled,
}

Honeybadger
  .configure(config)
  .beforeNotify((notice) => {
    if (!notice) {
      return false
    }
    if (!enabled || isHoneybadgerTransportNoise(notice.message)) {
      return false
    }
    notice.backtrace.forEach((line) => {
      if (line.file) {
        line.file = line.file.replace(`${projectRoot}/.next/server`, `${process.env.NEXT_PUBLIC_HONEYBADGER_ASSETS_URL}/..`)
      }
      return line
    })
  })

if (enabled) {
  Honeybadger.logger.debug('Honeybadger configured for server')
}
