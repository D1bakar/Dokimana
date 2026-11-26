import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

async function read(path: string) {
  return readFile(join(root, path), 'utf8')
}

const pages = ['app/page.tsx', 'app/not-found.tsx', 'app/example/page.tsx']
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

  it('includes the added sections and links to the sample report', async () => {
    const home = await read('app/page.tsx')
    const ids = ['captured-run', 'quickstart', 'example', 'fit', 'accuracy']
    let previous = -1
    for (const id of ids) {
      const index = home.indexOf(`id="${id}"`)
      expect(index, `missing section ${id}`).toBeGreaterThan(-1)
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
    expect(home).toContain('Captured run')
    expect(home).toContain('30-second quickstart')
    expect(home).toContain('Sample evidence report')
    expect(home).toContain('When to use / when not to use')
    expect(home).toContain('Measured accuracy')
    expect(home).toContain('href="/example"')
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

  it('shows the local checkout path and labels npm as a future form only', async () => {
    const home = await read('app/page.tsx')
    expect(home).toContain('Copy-paste setup')
    expect(home).toContain('npm ci && npm run build && npm start -- scan')
    expect(home).toContain('not published to npm')
    expect(home).toContain('npx dokimana scan')
    expect(home).toContain('future package-install form')
    expect(home).toContain('Runtime proof, automatic fixes')
    expect(home).toContain('Live Stripe verification')
  })

  it('keeps generated data placeholders honest', async () => {
    const [runText, reportText, accuracyText] = await Promise.all([
      read('data/example-run.json'),
      read('data/example-report.json'),
      read('data/accuracy.json'),
    ])
    const run = JSON.parse(runText) as {
      status: string
      commands: unknown[]
      output: unknown[]
    }
    const report = JSON.parse(reportText) as {
      status: string
      summary: unknown[]
      changes: unknown[]
    }
    const accuracy = JSON.parse(accuracyText) as {
      status: string
      metrics: unknown[]
    }

    expect(['pending-generation', 'generated']).toContain(run.status)
    expect(Array.isArray(run.commands)).toBe(true)
    if (run.status === 'pending-generation') expect(run.output).toEqual([])

    expect(['pending-generation', 'generated']).toContain(report.status)
    if (report.status === 'pending-generation') {
      expect(report.summary).toEqual([])
      expect(report.changes).toEqual([])
    }

    expect(typeof accuracy.status).toBe('string')
    if (accuracy.status === 'pending') expect(accuracy.metrics).toEqual([])
  })

  it('renders the sample report from generated JSON without client logic', async () => {
    const example = await read('app/example/page.tsx')
    expect(example).toContain("reportData from '@/data/example-report.json'")
    expect(example).toContain('export const metadata')
    expect(example).toContain('id="main"')
    expect(example).toContain('href="/"')
    expect(example).not.toMatch(/['"]use client['"]|useState|useEffect/)
  })

  it.each(['app/layout.tsx', 'app/not-found.tsx', 'app/example/page.tsx'])(
    '%s exports page metadata',
    async (page) => {
      expect(await read(page)).toContain('export const metadata')
    },
  )

  it('sets canonical and social metadata with a local OG image', async () => {
    const layout = await read('app/layout.tsx')
    expect(layout).toContain('metadataBase')
    expect(layout).toContain("canonical: '/'")
    expect(layout).toContain('openGraph')
    expect(layout).toContain("url: '/og.png'")
    expect(layout).toContain('twitter')
    await expect(access(join(root, 'public/og.png'))).resolves.toBeUndefined()
  })

  it('keeps the design restrained, accessible, and dark-mode friendly', async () => {
    const css = await read('app/globals.css')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain(':where(a, [tabindex]):focus-visible')
    expect(css).not.toMatch(/box-shadow|linear-gradient|radial-gradient|@import|url\(/)
  })

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

  it('generates example data from two report files without executing code or using network', async () => {
    const generator = await read('../scripts/generate-site-example.mjs')
    expect(generator).toContain("from 'node:fs/promises'")
    expect(generator).toContain("--terminal <file>")
    expect(generator).toContain("--markdown <file>")
    expect(generator).not.toMatch(/child_process|node:https?|fetch\(|import\(/)
  })

  it('opens a pull request from a least-privilege workflow', async () => {
    const workflow = await read('../.github/workflows/site-example.yml')
    expect(workflow).toContain('workflow_dispatch')
    expect(workflow).toContain('workflow_run')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('pull-requests: write')
    expect(workflow).toContain('create-pull-request')
    expect(workflow).not.toContain('git push origin main')
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/)
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/)
  })

  it('does not collect secrets, load remote scripts, or use remote fonts', async () => {
    const all = (await Promise.all(scannedFiles.map(read))).join('\n')
    expect(all).not.toMatch(/sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY-----/)
    expect(all).not.toMatch(/fonts\.googleapis\.com|googletagmanager|google-analytics/)
    expect(all).not.toMatch(/<script[^>]+src=/)
    expect(all).not.toMatch(/type=["']password["']/)
  })
})
