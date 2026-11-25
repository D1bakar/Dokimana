# ApiProof Research Library

This directory records research relevant to ApiProof's design. Each file is a research brief with a stable citation, direct source link, a concise account of the authors' contribution, and an explicit note on what the paper does **not** establish for ApiProof.

These are not full-text copies. Follow the publisher, DOI, or author-hosted open-access link for the original work. No paper has been used to claim that ApiProof itself is validated.

## Papers

1. [Breaking Changes in Software Ecosystems: A Systematic Literature Review](papers/2026-breaking-changes-literature-review.md) — taxonomy, detection approaches, and the persistent difficulty of behavioral breaks.
2. [Roseau: Fast, Accurate, Source-Based API Breaking Change Analysis in Java](papers/2025-roseau-api-breaking-change-analysis.md) — API models, structural compatibility analysis, and benchmark methodology.
3. [Is the Cure Worse Than the Disease? Overfitting in Automated Program Repair](papers/2015-overfitting-automated-program-repair.md) — why passing a repair test suite alone does not establish a correct patch.
4. [DART: Directed Automated Random Testing](papers/2005-directed-automated-random-testing.md) — automated test-input generation from program paths and constraints.

## Research use policy

- Prefer proceedings, publisher landing pages, DOI records, and author-hosted versions over secondary summaries.
- Cite the version and access date when reporting changing or preprint literature.
- Attribute every numeric result to the study and its setup. Do not generalize Java results to Stripe APIs or TypeScript without separate evidence.
- Use findings to form engineering hypotheses, not as proof that a feature works.
- Keep benchmark data separate from literature notes. ApiProof benchmark values must come from measured runs with reviewed ground truth.
