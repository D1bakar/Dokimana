import { describe, expect, it } from 'vitest'
import { filterSearchItems, searchItems } from './search-data'

describe('filterSearchItems', () => {
  it('returns nothing for an empty query', () => {
    expect(filterSearchItems('')).toEqual([])
    expect(filterSearchItems('   ')).toEqual([])
  })

  it('matches titles, previews, categories, and keywords case-insensitively', () => {
    expect(filterSearchItems('SCAN').map((item) => item.href)).toContain('/quickstart#scan')
    expect(filterSearchItems('could_not_run').map((item) => item.href)).toContain(
      '/quickstart#verify',
    )
    expect(filterSearchItems('github action').map((item) => item.href)).toContain('/docs#action')
  })

  it('returns no results for an unrelated query', () => {
    expect(filterSearchItems('kubernetes helm chart')).toEqual([])
  })

  it('keeps every entry addressable and unique', () => {
    const hrefs = searchItems.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.every((href) => href.startsWith('/'))).toBe(true)
  })
})
