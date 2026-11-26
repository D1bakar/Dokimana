import Link from 'next/link'

const contents = [
  { href: '#what-it-is', label: 'What it is' },
  { href: '#what-it-does', label: 'What it does' },
  { href: '#limits', label: 'What it cannot do yet' },
  { href: '#setup', label: 'Setup' },
  { href: '#use', label: 'How to use it' },
  { href: '#difference', label: 'How it is different' },
]

function Command({ children }: { children: string }) {
  return (
    <pre className="command">
      <code>{children}</code>
    </pre>
  )
}

export default function HomePage() {
  return (
    <div className="shell">
      <header className="masthead">
        <Link href="/" className="wordmark">
          ApiProof
        </Link>
        <p className="masthead-note">Local evidence for Stripe API changes</p>
        <Link
          className="masthead-source"
          href="https://github.com/D1bakar/Dokimana"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source
        </Link>
      </header>

      <div className="workspace">
        <nav className="contents" aria-label="On this page">
          <p className="contents-title">Contents</p>
          <ol className="contents-list">
            {contents.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <main id="main" tabIndex={-1}>
          <article className="document">
            <p className="document-path">readme / apiproof</p>
            <h1>Trace Stripe API changes to the code that depends on them.</h1>
            <p className="document-intro">
              ApiProof compares two OpenAPI documents you supply, looks for TypeScript and
              JavaScript call sites that may depend on what changed, and writes evidence for a human
              to review. It reads local files. It does not call Stripe.
            </p>

            <section id="what-it-is" aria-labelledby="what-it-is-title">
              <h2 id="what-it-is-title">What it is</h2>
              <p>
                A small command-line tool and GitHub Action for an early, specific problem: a Stripe
                API contract changes, and you need to know which parts of your repository might be
                affected before you review or ship. It is local-first and produces files you can
                read, diff, and keep.
              </p>
              <p>
                It is not a hosted service, a Stripe dashboard, or a verification engine. The
                current verification runner is deliberately not configured; that fact is part of the
                output, not hidden behind a green check.
              </p>
            </section>

            <section id="what-it-does" aria-labelledby="what-it-does-title">
              <h2 id="what-it-does-title">What it does</h2>
              <p>
                <strong>Compares supplied contracts.</strong> It detects supported structural
                changes in old and new OpenAPI JSON: removals, type changes, requiredness increases,
                and removed enum values. Local component-schema references are supported.
              </p>
              <p>
                <strong>Finds likely call sites.</strong> It inspects TypeScript and JavaScript with
                ts-morph and reports statically identified Stripe client usage that references
                changed fields. Each finding carries evidence and confidence.
              </p>
              <p>
                <strong>Writes review artifacts.</strong> It produces machine-readable impact JSON
                and a Markdown evidence report. Findings are leads to investigate, not proof of a
                runtime failure.
              </p>
            </section>

            <section id="limits" aria-labelledby="limits-title">
              <h2 id="limits-title">What it cannot do yet</h2>
              <ul>
                <li>Fetch Stripe specifications or call the Stripe API.</li>
                <li>
                  Run old and new application scenarios. <code>verify</code> returns{' '}
                  <code>could_not_run</code> because the isolated runner is a stub.
                </li>
                <li>Prove runtime behavior or complete call-site coverage.</li>
                <li>
                  Invent a replacement field or semantic mapping. Unsupported changes return{' '}
                  <code>needs_human</code>.
                </li>
                <li>Apply patches to your files. There is no CLI fix command today.</li>
                <li>
                  Handle external or nested JSON Pointer references, dynamic client construction,
                  REST calls, generated or vendor code.
                </li>
              </ul>
            </section>

            <section id="setup" aria-labelledby="setup-title">
              <h2 id="setup-title">Setup</h2>
              <p>Node.js 20 or newer and npm are the only requirements.</p>
              <Command>{`git clone https://github.com/D1bakar/Dokimana.git
cd Dokimana
npm ci
npm run build
npm start -- doctor`}</Command>
              <p>
                <code>doctor</code> checks the key environment for unsafe values. A missing key is
                reported as not configured and is not an error.
              </p>
            </section>

            <section id="use" aria-labelledby="use-title">
              <h2 id="use-title">How to use it</h2>
              <p>
                Run a scan against the checked-in synthetic fixture pair to see the shape of the
                output. These files are not a real Stripe release baseline.
              </p>
              <Command>{`npm run dev -- scan \\
  --repo . \\
  --old fixtures/stripe-old.json \\
  --new fixtures/stripe-new.json \\
  --old-version fixture-old \\
  --new-version fixture-new \\
  --json apiproof-impact.json \\
  --markdown apiproof-evidence.md`}</Command>
              <p>
                Add <code>--fail-on-changes true</code> to exit with status 1 when structural
                changes are found. Reports are written before that gate is applied.
              </p>
              <p>Build a Markdown report from an existing impact file:</p>
              <Command>{`npm run dev -- report \\
  --repo . \\
  --impact apiproof-impact.json \\
  --provider-version fixture-new \\
  --output apiproof-evidence.md`}</Command>
              <p>
                Check key safety and verification status. A valid scenario still returns{' '}
                <code>could_not_run</code> and exits unsuccessfully until a real isolated runner
                exists.
              </p>
              <Command>{`npm run dev -- doctor
npm run dev -- verify --repo . --scenario ./scenario.json --json verification.json`}</Command>
              <p>
                In CI, the GitHub Action scans workspace-relative OpenAPI files and writes the same
                two reports. It does not download inputs or call Stripe. Pin and review those inputs
                in your own workflow.
              </p>
            </section>

            <section id="difference" aria-labelledby="difference-title">
              <h2 id="difference-title">How it is different</h2>
              <p>
                No superiority claim is being made here. These are concrete boundaries you can
                check in the source:
              </p>
              <ul>
                <li>Your OpenAPI inputs and repository stay local; no provider is fetched.</li>
                <li>A scan needs no Stripe key, and live keys are refused where keys are checked.</li>
                <li>Findings carry evidence and confidence instead of a bare pass or fail.</li>
                <li>Unsupported changes stay <code>needs_human</code> rather than becoming guesses.</li>
                <li>
                  Missing verification is reported as <code>could_not_run</code>, never as a pass.
                </li>
                <li>Nothing is written to your source files automatically.</li>
              </ul>
            </section>
          </article>
        </main>
      </div>

      <footer className="statusline">
        <p>ApiProof · local files only · Node.js 20+ · verification: could_not_run</p>
        <Link
          href="https://github.com/D1bakar/Dokimana/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Project README
        </Link>
      </footer>
    </div>
  )
}
