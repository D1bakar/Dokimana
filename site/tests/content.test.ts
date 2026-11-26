import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

async function read(path: string) {
  return readFile(join(root, path), 'utf8')
}

const pages = ['app/page.tsx', 'app/not-found.tsx']
const config = 'next.config.mjs'
const scannedFiles = [...pages, config]

describe('site content', () => {
  it('keeps only the document sections in the requested order', async () => {
    const home = await read('app/page.tsx')
    const ids = [
      'what-it-is',
      'what-it-does',
      'limits',
      'setup',
      'use',
      'difference',
    ]
    let previous = -1
    for (const id of ids) {
      const index = home.indexOf(`id="${id}"`)
      expect(index, `missing section ${id}`).toBeGreaterThan(-1)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
    expect(home).toContain('What it cannot do yet')
    expect(home).toContain('How it is different')
  })

  it('states the verification and evidence boundaries', async () => {
    const home = await read('app/page.tsx')
    expect(home).toContain('could_not_run')
    expect(home).toContain('needs_human')
    expect(home).toContain('does not call Stripe')
    expect(home).toContain('No superiority claim')
  })

  it('uses the real CLI commands and flags from the project README', async () => {
    const [home, readme] = await Promise.all([read('app/page.tsx'), read('../README.md')])
    for (const fragment of ['--fail-on-changes true', 'fixtures/stripe-old.json', 'npm ci']) {
      expect(home).toContain(fragment)
      expect(readme).toContain(fragment)
    }
  })

  it.each(['app/layout.tsx', 'app/not-found.tsx'])(
    '%s exports page metadata',
    async (page) => {
      expect(await read(page)).toContain('export const metadata')
    },
  )

  it('redirects old topic routes into the document', async () => {
    const nextConfig = await read(config)
    const redirects = [
      ['/method', '/#what-it-does'],
      ['/safety', '/#limits'],
      ['/quickstart', '/#setup'],
      ['/docs', '/#use'],
      ['/about', '/#what-it-is'],
      ['/contact', 'https://github.com/D1bakar/Dokimana/issues/new'],
    ]
    for (const [source, destination] of redirects) {
      expect(nextConfig).toContain(`source: '${source}'`)
      expect(nextConfig).toContain(`destination: '${destination}'`)
    }
  })

  it('does not collect secrets, load remote scripts, or use remote fonts', async () => {
    const all = (await Promise.all(scannedFiles.map(read))).join('\n')
    expect(all).not.toMatch(/sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY-----/)
    expect(all).not.toMatch(/fonts\.googleapis\.com|googletagmanager|google-analytics/)
    expect(all).not.toMatch(/<script[^>]+src=/)
    expect(all).not.toMatch(/type=["']password["']/)
  })
})
