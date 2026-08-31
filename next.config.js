/* eslint-disable @typescript-eslint/no-require-imports */
const { setupHoneybadger } = require('@honeybadger-io/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  async redirects() {
    return [
      {
        source: "/programs/bachelor",
        destination: "/programs/bachelors",
        permanent: true,
      },
      {
        source: "/programs/certificate",
        destination: "/programs/certificates",
        permanent: true,
      },
      {
        source: "/course/:id",
        destination: "/courses/:id",
        permanent: true,
      },
    ]
  },
}

module.exports = setupHoneybadger(nextConfig)
