# Dokimana site

A single-page document site for Dokimana, built with Next.js 15 (App Router) and React 19.
It is statically renderable, has no runtime backend, and adds no custom client-side
navigation or appearance logic beyond the Next.js defaults.

## Structure

The homepage is one document with six sections: what Dokimana is, what it does, what it
cannot do yet, setup, how to use it, and how it is different. A text contents rail links
to each section. Former topic routes redirect from `next.config.mjs` to the matching
section or to the project issue tracker, so existing links keep working without extra
page files.

```
app/page.tsx       document and in-page contents
app/layout.tsx     metadata, skip link, stylesheet
app/globals.css    all styles
app/not-found.tsx  missing-route fallback
tests/             source-level content checks and document navigation tests
```

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

`next.config.mjs` pins the tracing root to this directory, keeps type and lint errors
fatal during builds, and holds the old-route redirects.

## Visual system

Content first, no decoration. The palette is a paper background (`#f5f5f5`), ink text
(`#292929`), and one blue link accent (`#1656cc`). Prose uses a serif stack, headings use
a system sans, and commands and paths use a system mono. There are no cards, borders,
shadows, gradients, badges, stock images, remote fonts, or entrance animation. The
layout is deliberately narrow and text-led: a plain contents rail beside a reading
column, with a factual status line at the bottom.

The design is informed by two references supplied for their restraint rather than their
imagery: [Threadlocked](https://threadlocked.xyz/) for its narrow, unboxed, serif reading
column, and [Right Hemisphere](https://www.righthemisphere.studio/) for large, sparing
typography and generous vertical space. Nothing from either site is copied.

## Copy rules

Claims come from `../README.md` and `../agent.md`. Keep the current limits explicit: no
live Stripe calls; no provider retrieval; unsupported patterns remain outside coverage;
the container runner reports `could_not_run` and does not execute repository code. Do not
add a secret-entry field, tracker, remote script, invented metric, or claim that a scan
proves runtime safety. Commands and flags shown on the page must match the real CLI.
