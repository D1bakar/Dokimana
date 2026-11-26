# ApiProof Website Design System

The Next.js pages in `site/` use an evidence-first editorial language: a real product artifact is the visual subject, not a metaphor or a generic dashboard.

## Surface and mode

- **Surface:** public product landing, method, safety, and quick-start pages.
- **Mode:** persuade engineers with a legible evidence trail, then guide them to local CLI usage.
- **Audience:** developers evaluating a Stripe API-change impact tool.
- **Visual direction:** adapt the image-led hierarchy and spacious composition of the requested property reference using ApiProof's actual report artifact as the visual. Do not copy its content or use an unrelated architectural metaphor.

## Color

The interface uses exactly three base colors. Transparent tints are derived only from these roles.

| Role            | Value     | Use                                                                       |
| --------------- | --------- | ------------------------------------------------------------------------- |
| Deep navy       | `#0A2540` | Primary text, source excerpt, footer, and high-contrast evidence surfaces |
| Cool near-white | `#F6F9FC` | Page background, readable panels, and text on navy                        |
| Indigo          | `#635BFF` | Structural change marks, focus indicator, active accents, and key links   |

No additional hue, colorful gradient, or rainbow status system. Statuses are labeled in words. Opacity variations of the three colors provide hierarchy.

## Type and layout

- **Display:** Georgia/system serif stack for editorial headlines, paired with a native system sans for navigation and reading.
- **Technical face:** system monospace, limited to code, paths, flags, and structural change names.
- **Content width:** maximum 1320px for the landing page and 1100px for reading sections; use generous horizontal and vertical breathing room.
- **Homepage opening:** a direct product promise and local action lead to a synthetic report excerpt showing a before/after schema and a possible source match.
- **Reading rhythm:** inspect the evidence example, read what static analysis can and cannot show, see the verifier's actual `could_not_run` state, then reach the local quick start.

## Components and behavior

- **Header:** compact wordmark, Method/Safety/Docs navigation, search, appearance toggle, and local-scan action; a keyboard-operable disclosure menu on narrow screens.
- **Evidence excerpt:** semantic HTML displays fictional before/after schema snippets and a possible source match. A nearby disclosure says no scan ran and the values are invented.
- **Search:** a site-wide dialog opens from the header or with `/` (also Ctrl/Cmd+K), indexes every command and boundary, and supports arrow keys, Enter, Escape, and focus return.
- **Evidence boundary:** distinguish supported static findings from complete coverage or runtime proof; unsupported fixes remain `needs_human`.
- **Verification record:** reports `could_not_run`, explicitly stating that repository code was not executed.
- **Motion:** no entrance or reveal animation; static evidence stays visible immediately. Respect reduced motion for any future nonessential movement.
- **Assets:** product evidence is rendered as local HTML and CSS; no stock image, decorative illustration, external font, or network dependency.

## Anti-template review

The user supplied [“Fix AI Slop Website Design”](https://buildtolaunch.substack.com/p/fix-ai-slop-website-design) as a negative reference. Use it as a prompt to inspect combinations of unmotivated conventions, not as a ban on every small label, number, serif face, or card in isolation. For this site, the concrete choices are to avoid a centered generic hero, a headline with one highlighted word, repeated uppercase kickers, a three-card feature grid, generic status badges, architectural filler, and decorative reveal animation. The product report—not a metaphor—is the hero. Keep only labels that identify actual synthetic evidence or runtime status. Do not use statistics from the article as universal findings.

## Accessibility and responsive rules

Use semantic landmarks, a skip link, one `h1`, ordered headings, meaningful link names, visible focus, and text labels for statuses. The synthetic report is semantic HTML, not an image. On tablet and mobile, reflow the proposition, comparison panes, source excerpt, and status record into a readable column. Preserve keyboard access, zoom, source order, and reduced motion.

## Product-truth constraints

The report's field name and source location are fictional, not a Stripe schema or scan result. Static impact is likely evidence, not proof of runtime failure. The container runner does not execute scenarios and returns `could_not_run`. Do not add a secret-entry field, live API calls, trackers, remote fonts, or claims of complete call-site coverage.

See [`design.md`](design.md) for the visual contract, reference research, and review checklist.
