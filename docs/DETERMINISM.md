# Scan determinism

A `scan` writes a `contentSha256` field instead of a wall-clock `generatedAt` timestamp. The hash is computed from the impact content after sorting and normalization; the evidence report computes its own hash from the evidence content. Repeated scans of the same inputs therefore produce byte-identical JSON and Markdown files.

The previous output differed only in the timestamp:

```diff
-  "generatedAt": "2026-11-28T15:51:24.588Z",
+  "generatedAt": "2026-11-28T15:51:27.455Z",
```

## Measured comparison

Environment: Node.js `v20.19.5`, Windows. The fixture repo was `src/scanner/fixtures/positive` and the specification pair was `fixtures/stripe-old.json` / `fixtures/stripe-new.json`. The command was run three times: twice with the repository path from `Resolve-Path` (Windows backslashes) and once with the same path converted to forward slashes.

| Run | Repository argument style                                                  | `contentSha256`                                                    |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A   | `C:\Users\PC\Desktop\D1bakar's\web\Dokimana\src\scanner\fixtures\positive` | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` |
| B   | same as A                                                                  | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` |
| C   | `C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive` | `c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2` |

All three invocations exited `0`. The `root` field was `C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive` in all three reports.

`git diff --no-index` was used for the four comparisons:

| Comparison               | Exit code | Diff output |
| ------------------------ | --------: | ----------- |
| JSON A vs JSON B         |         0 | none        |
| Markdown A vs Markdown B |         0 | none        |
| JSON A vs JSON C         |         0 | none        |
| Markdown A vs Markdown C |         0 | none        |

Exit code `0` from `git diff --no-index` means the files were byte-identical. The measured result is limited to this fixture pair on this host; it is not a proof of byte-identical output for every repository or provider version.

## Repeatable check

`npm run verify:determinism` runs the three scans, compares the four output pairs with `git diff --no-index`, and removes the temporary directory. Measured result on Node.js `v20.19.5`:

```json
{
  "status": "pass",
  "node": "v20.19.5",
  "runs": [
    {
      "label": "windows-path-a",
      "exitCode": 0,
      "contentSha256": "c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2",
      "root": "C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive"
    },
    {
      "label": "windows-path-b",
      "exitCode": 0,
      "contentSha256": "c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2",
      "root": "C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive"
    },
    {
      "label": "forward-slash-path",
      "exitCode": 0,
      "contentSha256": "c91115bb298bc1728fb3b4a99f10de76ecb6a8f704806d872a23b0824047c6b2",
      "root": "C:/Users/PC/Desktop/D1bakar's/web/Dokimana/src/scanner/fixtures/positive"
    }
  ],
  "comparisons": [
    {
      "label": "json-same-path",
      "identical": true,
      "gitDiffExitCode": 0,
      "diffOutput": ""
    },
    {
      "label": "markdown-same-path",
      "identical": true,
      "gitDiffExitCode": 0,
      "diffOutput": ""
    },
    {
      "label": "json-forward-slash-path",
      "identical": true,
      "gitDiffExitCode": 0,
      "diffOutput": ""
    },
    {
      "label": "markdown-forward-slash-path",
      "identical": true,
      "gitDiffExitCode": 0,
      "diffOutput": ""
    }
  ],
  "failures": []
}
```
