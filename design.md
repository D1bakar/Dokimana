# ApiProof Website: Design Contract and Review Checklist

This brief records the visual world for the Next.js pages in `site/`, the external references informing it, and product-specific checks for truthfulness and quality.

## What “AI slop” means here

“AI slop” is unconsidered output: choices copied from a template, decoration without a job, copy that could describe any product, or apparent proof that is not real. It is a quality failure, not a particular tool or aesthetic.

### Visual and composition tells

- **Template scaffolding:** identical icon-title-paragraph cards for every section; repeated three-card grids; a centered headline over a generic dashboard.
- **Unmotivated labeling:** tiny tracked uppercase labels above every heading, meaningless section numbers, excess tags, and fake “beta” indicators.
- **Decoration standing in for substance:** gradient headlines, glass blur, glows, random colors, generic icon tiles, or code panels unrelated to ApiProof.
- **Invented instrumentation:** fake metrics, progress meters, pretend scans, pulsing “live” dots, or mock status implying a Stripe connection.
- **Category camouflage:** generic dark-neon developer-tool styling or a beige/serif/terracotta premium template selected only from category stereotypes.
- **Stock composition:** generic abstract networks or stock images in place of showing how a contract change traces to likely source usage.
- **Palette drift:** introducing colors beyond navy `#0A2540`, near-white `#F6F9FC`, and indigo `#635BFF`.

These are warning signs, not categorical bans. Ask what task an element serves, which product truth it communicates, and whether removing it would make the page less informative.

### Copy and claims tells

- Hype such as “revolutionary,” “effortless,” “zero risk,” or “AI-powered” without specific, verified behavior.
- Fabricated customers, adoption, benchmarks, uptime, prices, certifications, or security guarantees.
- A synthetic field, diagram, trace, or “finding” presented as a real Stripe spec or repository scan.
- A likely static-analysis result presented as a proven runtime failure or complete call-site coverage.
- A planned container interface described as a working isolated verifier.

### Interaction and accessibility tells

- Controls that do nothing, dead links, hidden focus styles, inaccessible hover-only information, or keyboard-inoperable mobile navigation.
- Motion without purpose or without respecting `prefers-reduced-motion`.
- Low-contrast text, clipped code, page-level horizontal overflow, or undersized touch targets.
- A security story told only through badges, or any secret-entry field on a marketing page.

## Reference research

References inspected **2026-11-25**. The requested Dribbble shot is behind an AWS WAF in this environment, so its pixels could not be visually reviewed. The publicly indexed description for the Vertex real-estate design describes a luxury, image-led discovery experience with clear hierarchy and responsive behavior; those broad qualities inform the adaptation below. The implementation does not claim pixel-for-pixel reproduction.

1. **User reference: “Real Estate Website Design - Vertex,” Dribbble.** Requested direction for immersive visual storytelling, premium hierarchy, and responsive discovery patterns; the direct shot preview was inaccessible during implementation.
   https://dribbble.com/shots/27357269-Real-Estate-Website-Design-Vertex
2. **Publicly indexed Vertex luxury real-estate design description.** The search result describes a clean hierarchy, immersive imagery, and responsive property discovery; used only as accessible reference context, not as confirmation of the exact requested shot.
   https://dribbble.com/shots/27448712-Vertex-Luxury-Real-Estate-Website-Design
3. **Stripe design extract, shared by the user.** Its named colors remain the site's restricted palette: `#0A2540`, `#F6F9FC`, and `#635BFF`. No Stripe assets, copy, or affiliation are implied.
   https://designmd.me/s/stripe-cd7ld
4. **W3C, Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation.** Basis for keyboard operation, focus visibility, text and non-text contrast, target sizing, zoom/reflow, and reduced motion where applicable.
   https://www.w3.org/TR/WCAG22/
5. **GOV.UK Design System.** Reusable patterns should support user tasks and be grounded in evidence and accessibility rather than decoration.
   https://design-system.service.gov.uk/
6. **User-supplied negative reference: “Fix AI Slop Website Design.”** Used as a reminder to evaluate combinations of generic defaults (composition, copy, labels, cards, and motion) rather than imitate or mechanically ban individual styles. No statistics from the article are treated as universal evidence.
   https://buildtolaunch.substack.com/p/fix-ai-slop-website-design

## Product truth and audience

**Product:** ApiProof is an early, Stripe-focused CLI-first project. It compares structured OpenAPI JSON, scans TypeScript/JavaScript with AST tooling for likely call-site impact, generates only constrained evidence-backed fixes, and produces evidence reports. The current container runner is a stub and does not execute scenarios.

**Audience:** engineers reviewing Stripe API changes in an application repository. They need to know what changed, where code may depend on it, and whether execution actually verified anything.

**Visitor job:** understand current scope and boundaries, inspect a synthetic report excerpt without mistaking it for a real scan, then run the local CLI on fixtures. Site-wide search should answer command and boundary questions without leaving the current page.

**Do not claim:** customers, adoption, external validation, benchmark performance, complete AST coverage, actual Stripe endpoint/field details in the sample, a working container verifier, live API integration, or secret handling by the site.

## Chosen visual contract

- **Direction:** evidence folio. Preserve the reference's spacious, image-led hierarchy, but make ApiProof's own artifact the image: a large synthetic report excerpt with a contract comparison and possible source match. Do not use an architectural metaphor to stand in for the product.
- **Use scene:** an engineer reviews a change on a laptop in a normal office or home workspace. The page should feel considered and spacious without compromising legibility.
- **Palette:** exactly three base colors—deep navy `#0A2540`, cool near-white `#F6F9FC`, and indigo `#635BFF`. Opacity variants can create hierarchy. No other hue or colorful gradient.
- **Composition:** direct product promise and local-scan action, followed by a full-width report excerpt showing supplied schema before/after and a possible source match; then a clear evidence boundary, the actual verification status, and a local quick-start action.
- **Typography:** system serif for large editorial headlines, system sans for navigation and explanatory copy, system monospace only for structured values and code. No network-loaded or proprietary font.
- **Motion:** no illustration entrance or reveal animation. Evidence is visible immediately; any future nonessential motion must honor reduced motion.
- **Evidence:** label the report example synthetic before its technical details are read. Its names and line number are fictional, and the page states that no scan ran. Show likely impact and the actual `could_not_run` boundary.
- **Actions:** header links target the real local docs and repository. Quick-start commands match the local project.

### Anti-template decisions

The negative reference is not interpreted as “avoid all recognizable design.” It is a check against unconsidered combinations. The page avoids a centered generic hero, a single differently colored headline word, repeated tiny uppercase kickers, an equal three-card feature grid, generic status badges, architectural filler, and decorative entrance motion. The product report—not a metaphor or generic dashboard—is the hero. Synthetic and `could_not_run` disclosures remain because they prevent false evidence claims. The reference article's example statistics are not presented as general research findings.

## Responsive and accessibility requirements

- Semantic landmarks, one `h1`, ordered heading levels, meaningful links, and a skip link.
- The report is semantic HTML; synthetic status and runtime uncertainty are also written as text.
- Maintain WCAG AA contrast; use navy on near-white and near-white on navy. Indigo is an accent and focus color, not the sole status signal.
- At narrow widths, stack the hero, comparison panes, source excerpt, and verification details. Code may scroll within its own excerpt; the page itself must not overflow horizontally.
- Support keyboard navigation, browser zoom, and reflow without page-level horizontal overflow.
- Honor `prefers-reduced-motion`; never hide content behind animation.
- No secret fields, trackers, cookie banners, remote scripts, API calls, or network-loaded fonts.

## Human review checklist

- [ ] The visitor understands ApiProof's product, evidence trail, and next action within seconds.
- [ ] The report values and source location are visibly identified as fictional; no scan is implied.
- [ ] Likely impact, current scope, and unconfigured verification are stated accurately.
- [ ] Every local page and command link resolves.
- [ ] Keyboard traversal and focus states work, including mobile navigation.
- [ ] Contrast and layout are checked at desktop, tablet, and 320–390px mobile widths.
- [ ] No content depends on animation; reduced-motion behavior remains respected for any future motion.
- [ ] No page-level overflow, clipped labels, or inaccessible report information.
- [ ] No secret-entry field, external font, tracker, or claim of live verification exists.
- [ ] References stay attributed; no external design's content or assets are copied.
