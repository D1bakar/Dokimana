# Breaking Changes in Software Ecosystems: A Systematic Literature Review

## Bibliographic record

Juntao Chen, Tingting Bi, Yanlin Wang, and Patanamon Thongtanunam. “Breaking Changes in Software Ecosystems: A Systematic Literature Review.” arXiv:2605.24397, submitted May 23, 2026. DOI: [10.48550/arXiv.2605.24397](https://doi.org/10.48550/arXiv.2605.24397).

- [arXiv abstract and version history](https://arxiv.org/abs/2605.24397)
- [Open HTML version 1](https://arxiv.org/html/2605.24397v1)
- [PDF](https://arxiv.org/pdf/2605.24397)
- Research type: systematic literature review; arXiv preprint.

## Research question and approach

The authors synthesize 97 primary studies across Maven/Java, npm/JavaScript, Python, Web APIs, and Linux distributions. Their review organizes breaking changes using dimensions including nature, detectability, scope, and visibility, and summarizes detection approaches and strategies for communicating, preventing, and recovering from breaks.

## Findings relevant to ApiProof

The authors report that syntactic breaks are comparatively amenable to detection, while behavioral breaks remain difficult to detect automatically. The review identifies multiple detection approaches rather than one universally sufficient detector. This supports a layered design: structural change records and AST evidence can identify likely impacts, but runtime comparison and explicit uncertainty are still needed.

For ApiProof, a structural diff should be treated as evidence of a possible contract change, not as proof of behavioral failure. A lack of AST findings cannot establish that all call sites are unaffected.

## Limitations and careful interpretation

This is a broad synthesis across ecosystems, not a Stripe-specific evaluation and not validation of ApiProof. The reported counts describe the authors' search and inclusion methodology; they are not performance estimates for this project. The cited arXiv version is a preprint and should be distinguished from a peer-reviewed publication if a later version appears.

## ApiProof design implications

- Keep syntactic and behavioral evidence distinct.
- Record unverified coverage and make uncertainty visible in reports.
- Do not treat semver labels or changelog wording alone as proof of compatibility.
- Build and publish an ApiProof-specific benchmark before making accuracy claims.

## Verification record

Metadata and abstract checked against the arXiv landing page on 2026-11-25.
