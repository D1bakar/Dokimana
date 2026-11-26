export type SearchItem = {
  title: string
  href: string
  category: string
  preview: string
  keywords?: string
}

export const searchItems: SearchItem[] = [
  {
    title: 'Quick start',
    href: '/quickstart',
    category: 'Guide',
    preview: 'Clone the repository, build the CLI, and run your first local scan.',
    keywords: 'install setup npm clone build',
  },
  {
    title: 'scan command',
    href: '/quickstart#scan',
    category: 'Command',
    preview: 'Compare two OpenAPI files and scan a repository for likely call sites.',
    keywords: 'diff compare openapi json impact call site',
  },
  {
    title: 'report command',
    href: '/quickstart#report',
    category: 'Command',
    preview: 'Turn an impact JSON report into Markdown evidence for code review.',
    keywords: 'markdown evidence output review',
  },
  {
    title: 'verify command',
    href: '/quickstart#verify',
    category: 'Command',
    preview: 'Validate a scenario and check key safety. The current runner reports could_not_run.',
    keywords: 'scenario verification could_not_run container',
  },
  {
    title: 'doctor command',
    href: '/quickstart#doctor',
    category: 'Command',
    preview: 'Check STRIPE_SECRET_KEY for live-key patterns before running other commands.',
    keywords: 'key safety secret environment live test key',
  },
  {
    title: 'CLI flags',
    href: '/quickstart#flags',
    category: 'Reference',
    preview: 'Every flag for scan, report, verify, and doctor in one table.',
    keywords: 'options arguments fail-on-changes repo json markdown',
  },
  {
    title: 'How it works',
    href: '/method',
    category: 'Guide',
    preview: 'The five stages from supplied contracts to a reviewable evidence report.',
    keywords: 'method stages pipeline architecture',
  },
  {
    title: 'What is detected',
    href: '/method#coverage',
    category: 'Reference',
    preview: 'Removals, requiredness increases, type changes, and removed enum values.',
    keywords: 'coverage removed required enum type schema parameter',
  },
  {
    title: 'Safety boundaries',
    href: '/safety',
    category: 'Guide',
    preview: 'No live Stripe calls, no secrets in the container, and no unverified execution.',
    keywords: 'security keys execution network read-only timeout',
  },
  {
    title: 'Execution limits',
    href: '/safety#execution',
    category: 'Reference',
    preview: 'The requested container settings and why the runner still reports could_not_run.',
    keywords: 'docker sandbox runner network secrets source mount',
  },
  {
    title: 'Docs overview',
    href: '/docs',
    category: 'Reference',
    preview: 'Command reference, GitHub Action setup, report contents, and scope limits.',
    keywords: 'documentation reference index',
  },
  {
    title: 'GitHub Action',
    href: '/docs#action',
    category: 'Reference',
    preview: 'Run a scan in CI against checked-in OpenAPI files and upload the evidence.',
    keywords: 'ci workflow yaml action inputs fail-on-changes artifact',
  },
  {
    title: 'Report contents',
    href: '/docs#reports',
    category: 'Reference',
    preview: 'What the impact JSON and Markdown evidence contain, and what they do not prove.',
    keywords: 'json markdown schema findings confidence coverage',
  },
  {
    title: 'Supported scope',
    href: '/docs#scope',
    category: 'Reference',
    preview: 'Local component-schema references are supported; rename inference is not.',
    keywords: 'limits unsupported references rename needs_human',
  },
  {
    title: 'About ApiProof',
    href: '/about',
    category: 'Project',
    preview: 'What the project is, what it believes, and its current limits.',
    keywords: 'mission project values',
  },
  {
    title: 'Contact',
    href: '/contact',
    category: 'Project',
    preview: 'Open an issue, report a security concern, or start a discussion.',
    keywords: 'support github issue security discussion',
  },
]

export function filterSearchItems(query: string): SearchItem[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  return searchItems.filter((item) =>
    [item.title, item.preview, item.category, item.keywords ?? '']
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  )
}
