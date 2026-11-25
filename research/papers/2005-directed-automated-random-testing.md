# DART: Directed Automated Random Testing

## Bibliographic record

Patrice Godefroid, Nils Klarlund, and Koushik Sen. “DART: Directed Automated Random Testing.” In _Proceedings of the ACM SIGPLAN 2005 Conference on Programming Language Design and Implementation (PLDI 2005)_, pages 213–223. ACM, 2005. DOI: [10.1145/1065010.1065036](https://doi.org/10.1145/1065010.1065036).

- [Author publication page and citation](https://osl.cs.illinois.edu/publications/conf/pldi/GodefroidKS05.html)
- [DOI / publisher record](https://doi.org/10.1145/1065010.1065036)
- [Conference paper PDF mirror](https://people.cs.vt.edu/gback/cs6304.spring07/papers/pldi2005.pdf)
- Research type: automated testing technique and tool.

## Contribution

DART combines static extraction of a program's external interface, automatic test-driver generation, random execution, and dynamic analysis to generate inputs that direct execution along alternative program paths. The original implementation described in the paper targets C programs.

## Relevance to ApiProof

The paper illustrates the value of connecting static interface information to executable tests. ApiProof similarly needs separate analysis and execution components: AST-level call-site evidence can help identify scenarios, while isolated runs are needed to compare observed behavior.

## Limitations and careful interpretation

DART is not a Stripe API migration tool and does not establish the safety or adequacy of ApiProof's scenario generation. It is an older approach implemented for C, so its techniques do not directly provide a TypeScript or Stripe solution. Generated test inputs also do not replace domain-specific expected outcomes.

## ApiProof design implications

- Keep scenario generation and scenario execution as separately testable interfaces.
- Preserve scenario provenance and inputs in reports.
- Explicit expected behavior is required to distinguish intentional from unexplained differences.
- An unexecuted or failed scenario must remain `could_not_run`.

## Verification record

Authors, venue, pages, DOI, and contribution checked against the authors' publication record on 2026-11-25.
