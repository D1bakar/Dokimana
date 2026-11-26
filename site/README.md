# ApiProof site

The public site for ApiProof, built with Next.js 15 (App Router) and React 19.
It is statically renderable and has no runtime backend dependency.

## Routes

| Route         | Purpose                                                    |
| ------------- | ---------------------------------------------------------- |
| `/`           | Product promise and a disclosed synthetic impact report    |
| `/method`     | Five stages from supplied contracts to reviewable evidence |
| `/safety`     | Key refusal and the container execution boundary           |
| `/quickstart` | Install, run each CLI command, and inspect flags           |
| `/docs`       | Command, GitHub Action, report, and scope reference        |
| `/about`      | Project scope and current limits                           |
| `/contact`    | Issue, security, and discussion channels                   |

`/` is the home page; an unmatched route renders `app/not-found.tsx`.

## Local development

```bash
cd site
npm ci
npm run dev
```

Open `http://localhost:3000`. Production checks:

```bash
npm run lint
npm run type-check
npm test
npm run build
npm start
```

`next.config.mjs` pins the tracing root to this directory and keeps type and lint
errors fatal during builds. `npm start` serves the production build.

## Structure

- `app/` — layouts, routes, global styles, and the SVG icon.
- `components/` — navigation, search dialog, code blocks, theme toggle, footer.
- `lib/search-data.ts` — the search index and its pure filter function.
- `tests/` — jsdom tests for navigation/search and source-level content checks.

Navigation and search are client components. The theme is applied by a
pre-paint inline script so a stored dark preference never flashes light.

## Visual system

Evidence-first editorial: serif display headlines, system sans reading text,
and a precise technical mono. Deep navy `#0A2540`, cool near-white `#F6F9FC`,
and indigo `#635BFF` are the only base colors; dark mode uses navy-derived
surfaces and opacity variants of the same palette.

The homepage puts a clearly synthetic impact-report excerpt first: a supplied
schema before/after and a possible source match. It explains what static
evidence can and cannot establish, shows the current `could_not_run` verifier
status, and links to the local CLI.

## Copy and asset rules

Claims come from `../README.md` and `../agent.md`. Keep the current limits
explicit: no live Stripe calls; local component-schema references are supported;
unsupported patterns remain outside coverage; the container runner reports
`could_not_run` and does not execute repository code.

The report excerpt is synthetic, not a real Stripe contract, repository scan, or
finding. Keep its disclosure adjacent to the code, and do not imply a scan was
run. Do not add stock imagery, third-party scripts, remote fonts, key-entry
forms, invented metrics, generic status badges, or claims of live verification.
