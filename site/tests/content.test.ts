import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

async function read(path: string) {
  return readFile(join(root, path), 'utf8')
}

const pages = [
  'app/page.tsx',
  'app/method/page.tsx',
  'app/safety/page.tsx',
  'app/quickstart/page.tsx',
  'app/docs/page.tsx',
  'app/about/page.tsx',
  'app/contact/page.tsx',
  'app/not-found.tsx',
]

describe('site content', () => {
  it('labels the homepage example as synthetic and states the verification boundary', async () => {
    const home = await read('app/page.tsx')
    expect(home).toContain('fictional')
    expect(home).toContain('synthetic')
    expect(home).toContain('could_not_run')
    expect(home).toContain('needs_human')
  })

  it.each(pages.filter((page) => page !== 'app/page.tsx'))(
    '%s exports page metadata',
    async (page) => {
      expect(await read(page)).toContain('export const metadata')
    },
  )

  it('resolves every internal route referenced by nav, footer, or search', async () => {
    const sources = await Promise.all([
      read('components/nav.tsx'),
      read('components/footer.tsx'),
      read('lib/search-data.ts'),
    ])
    const routes = new Set(
      sources.flatMap((source) =>
        [...source.matchAll(/(?:href=|href:)\s*['"](\/[^'"]*)['"]/g)].map(
          (match) => match[1]!.split('#')[0]!,
        ),
      ),
    )

    expect(routes.size).toBeGreaterThan(0)
    await Promise.all(
      [...routes].map(async (route) => {
        const file = route === '/' ? 'app/page.tsx' : `app${route}/page.tsx`
        await expect(access(join(root, file))).resolves.toBeUndefined()
      }),
    )
  })

  it('resolves every in-site anchor used by search and footer links', async () => {
    const sources = await Promise.all([
      read('components/footer.tsx'),
      read('lib/search-data.ts'),
      read('app/docs/page.tsx'),
    ])
    const links = sources.flatMap((source) =>
      [...source.matchAll(/(?:href=|href:)\s*['"](\/[^'"]*#[^'"]+)['"]/g)].map(
        (match) => match[1]!,
      ),
    )

    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      const [route, anchor] = link.split('#')
      const file = route === '/' ? 'app/page.tsx' : `app${route}/page.tsx`
      expect(await read(file)).toContain(`id="${anchor}"`)
    }
  })

  it('does not collect secrets, load remote scripts, or use remote fonts', async () => {
    const sources = await Promise.all(pages.map(read))
    const all = sources.join('\n')
    expect(all).not.toMatch(/sk_live_|-----BEGIN [A-Z ]*PRIVATE KEY-----/)
    expect(all).not.toMatch(/fonts\.googleapis\.com|googletagmanager|google-analytics/)
    expect(all).not.toMatch(/<script[^>]+src=/)
    expect(all).not.toMatch(/type=["']password["']/)
  })
})
