# Is the Cure Worse Than the Disease? Overfitting in Automated Program Repair

## Bibliographic record

Edward K. Smith, Earl T. Barr, Claire Le Goues, and Yuriy Brun. “Is the Cure Worse Than the Disease? Overfitting in Automated Program Repair.” In _Proceedings of the 10th Joint Meeting on Foundations of Software Engineering (ESEC/FSE 2015)_, 2015. DOI: [10.1145/2786805.2786825](https://doi.org/10.1145/2786805.2786825).

- [DOI / publisher record](https://doi.org/10.1145/2786805.2786825)
- [Author-hosted PDF](http://people.cs.umass.edu/~brun/pubs/pubs/Smith15fse.pdf)
- [Bibliographic record and abstract](https://gpbib.pmacs.upenn.edu/gp-html/Smith_2015_FSE.html)
- Research type: empirical evaluation of automated program repair.

## Research question and approach

The paper evaluates two automated repair tools on 998 benchmark bugs and assesses generated patches using tests independent from those used during repair. The central concern is that using the same tests both to generate and to judge patches can reward patches that fit the test suite without preserving intended behavior more broadly.

## Findings relevant to ApiProof

The authors report that independent-test performance was not reliably improved by the evaluated repair tools and that patch quality was related to test-suite coverage. Their results demonstrate why a patch that passes its generating tests should not automatically be called correct.

## Limitations and careful interpretation

The study concerns specific repair tools, benchmarks, and programs from 2015. It is not a direct evaluation of modern LLM-based repair, Stripe migrations, or ApiProof. Its numerical results should not be generalized to ApiProof.

## ApiProof design implications

- Keep generated patch confidence separate from verification outcomes.
- Do not call a generated change “correct” merely because it compiles or passes a narrow fixture.
- Compare behavior with explicit scenario expectations and retain unexplained differences.
- Prefer `needs_human` when mapping or semantics are unsupported.

## Verification record

Authors, title, conference, DOI, and abstract-level claims checked against the ACM DOI and bibliographic record on 2026-11-25.
