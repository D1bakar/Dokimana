import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))

const redirects = [
  { source: '/method', destination: '/#what-it-does', permanent: false },
  { source: '/safety', destination: '/#limits', permanent: false },
  { source: '/quickstart', destination: '/#setup', permanent: false },
  { source: '/docs', destination: '/#use', permanent: false },
  { source: '/about', destination: '/#what-it-is', permanent: false },
  {
    source: '/contact',
    destination: 'https://github.com/D1bakar/Dokimana/issues/new',
    permanent: false,
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: siteRoot,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return redirects
  },
}

export default nextConfig
