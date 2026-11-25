# Roseau: Fast, Accurate, Source-Based API Breaking Change Analysis in Java

## Bibliographic record

Corentin Latappy, Thomas Degueule, Jean-Rémy Falleri, Romain Robbes, and Lina Ochoa. “Roseau: Fast, Accurate, Source-based API Breaking Change Analysis in Java.” In _Proceedings of the 41st IEEE International Conference on Software Maintenance and Evolution (ICSME 2025)_, Auckland, New Zealand, September 2025. Preprint: [arXiv:2507.17369](https://arxiv.org/abs/2507.17369). DOI: [10.48550/arXiv.2507.17369](https://doi.org/10.48550/arXiv.2507.17369).

- [arXiv abstract, publication reference, and version history](https://arxiv.org/abs/2507.17369v1)
- [Open HTML version 1](https://arxiv.org/html/2507.17369v1)
- [PDF](https://arxiv.org/pdf/2507.17369v1)
- Research type: static-analysis tool and empirical evaluation; conference proceedings paper.

## Contribution and evaluation

Roseau constructs API models from source code or bytecode, applies semantic analysis, and compares API models to identify breaking changes across versions, commits, branches, or releases. The paper compares it with JApiCmp and Revapi using an extended/refined breaking-change benchmark. Its abstract reports F1 scores of 0.99 for Roseau, 0.86 for JApiCmp, and 0.91 for Revapi. It also reports analysis of 60 popular Maven Central libraries and a Guava history spanning 14 years and 6,839 commits.

These values are the authors' reported results under their Java benchmark and implementation. They are not transferable estimates for ApiProof, Stripe's OpenAPI, ts-morph, or JavaScript clients.

## Relevance to ApiProof

The work is a close design analogue for representing APIs as structured models and comparing versions, rather than relying exclusively on human-readable release notes. The model-comparison approach motivates keeping provider input normalization separate from the detector and retaining evidence/provenance on each change record.

## Limitations and careful interpretation

Roseau targets Java library APIs and its Java ecosystem tooling. It does not evaluate Stripe's API semantics, JavaScript runtime behavior, application-output equivalence, or safe patch generation. Its benchmark and F1 results cannot be used as ApiProof benchmarks.

## ApiProof design implications

- Preserve original structured input and normalized change evidence.
- Test detector behavior against an explicitly curated ground-truth fixture set.
- Report false-positive and false-negative behavior, not just number of differences.
- Keep source and schema-specific assumptions explicit; do not claim a generic API model covers all providers.

## Verification record

Authors, title, conference reference, abstract, and reported evaluation details checked against the arXiv record on 2026-11-25.
