# Dokimana website: design contract

This brief records the visual world for the Next.js pages in `site/`. The site is a
document, not a marketing funnel: one reading column, six sections, and no decoration.
Every element must earn its place by making the evidence or the boundary clearer.

## Decision

The previous card-and-panel presentation was discarded. The new reference direction is
threadlocked.xyz's unboxed, narrow, serif reading column combined with
righthemisphere.studio's large, sparing typography and generous vertical space. The
result is a clean developer document with a text contents rail, not an IDE mock-up and
not a generic landing page.

## Palette

Exactly three values:

| Role      | Value     | Use                           |
| --------- | --------- | ----------------------------- |
| Paper     | `#f5f5f5` | Page background               |
| Ink       | `#292929` | All body text and headings    |
| Link blue | `#1656cc` | Links and focus outlines only |

Hierarchy comes from size, weight, and space. Ink at reduced opacity may create secondary
text; no other hue, gradient, fill, or decorative color is introduced.

## Type and layout

- Serif stack for prose; system sans for headings, contents, and masthead; system mono
  for commands, flags, paths, and status values. No remote or proprietary fonts.
- Reading column maxes out near 720px; the contents rail is 200px; the outer shell caps
  at 1240px with responsive gutters.
- Headings are large and tightly tracked. Sections are separated by vertical space, not
  rules, cards, or panels.
- Commands are plain monospace text with wrapping. No terminal window, code panel,
  copy button, or background fill.
- The bottom status line states real facts: local files only, Node.js 20+,
  `verification: could_not_run`.

## Content contract

The document contains exactly six sections in this order:

1. What it is
2. What it does
3. What it cannot do yet
4. Setup
5. How to use it
6. How it is different

The difference section makes no competitor superiority claim. It lists verifiable design
boundaries: local inputs, no live calls, evidence and confidence, `needs_human`,
`could_not_run`, and no automatic writes to user files.

Do not claim customers, adoption, performance figures, complete AST coverage, a working
verification runner, live API integration, or secret handling by the site. Commands must
match the CLI in `src/cli.ts` and the project README.

## Interaction and accessibility

- One `h1`, ordered heading levels, semantic landmarks, a skip link, and a focusable main.
- Every section is reachable from the contents list; links use real anchors.
- Visible focus via the link-blue outline; keyboard and zoom work without horizontal
  page overflow.
- At narrow widths the contents rail becomes a two-column link grid above the reading column.
- No animation except instant scroll behavior, which is disabled under reduced motion.
- No secret fields, trackers, remote scripts, remote fonts, or network calls.

## Reference research

References inspected **2026-11-26** unless noted.

1. **Threadlocked** — supplied reference for an unboxed, text-first, serif reading column
   and a small set of principles stated plainly.
   https://threadlocked.xyz/
2. **Right Hemisphere** — supplied reference for large sparing typography, generous
   vertical rhythm, and a minimal text navigation.
   https://www.righthemisphere.studio/
3. **Dokimana design contract and review checklist (previous revision)** — retained the
   truthfulness checks that predate this redesign.
   `DESIGN.md` history in this repository.
4. **Stripe design extract, shared earlier.** No Stripe assets, copy, or affiliation are
   implied by the current palette.
   https://designmd.me/s/stripe-cd7ld
5. **W3C, Web Content Accessibility Guidelines (WCAG) 2.2.** Basis for keyboard access,
   focus visibility, contrast, and reflow.
   https://www.w3.org/TR/WCAG22/
6. **User-supplied negative reference: “Fix AI Slop Website Design.”** A reminder to
   reject unmotivated templates, cards, badges, and fake instrumentation; no statistics
   from the article are treated as general findings.
   https://buildtolaunch.substack.com/p/fix-ai-slop-website-design

## Review checklist

- [ ] The visitor sees what the tool is, what it does, its limits, setup, use, and differences in one scroll.
- [ ] No card, border, divider, shadow, gradient, badge, stock image, or remote font remains.
- [ ] Every command and limit matches `README.md` and `agent.md`.
- [ ] The synthetic nature of fixture inputs and the `could_not_run` boundary stay explicit.
- [ ] Old routes still resolve to the right section.
- [ ] Keyboard, focus, zoom, and 320–390px reflow work without page overflow.
