# ApiProof backend (optional)

A minimal Rust service skeleton for when the site needs a backend (e.g. contact
form handling or a search API). The frontend is a statically generated Next.js
site and does not require this to run.

## Status

Not wired up. The Rust toolchain (`cargo`) is not installed in this
environment, so this has not been compiled. Add `cargo` and run:

```bash
cargo run
```

Endpoints:
- `GET /health` — returns `ok`

Keep this minimal. Do not add features the static site doesn't need.
