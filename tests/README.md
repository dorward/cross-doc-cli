# CLI integration tests

Use `pnpm test` or `pnpm run test:coverage`. Each builds fresh dist first.
The normal suite takes about 35 seconds because one test exercises the library's
actual 30-second Prince timeout. It is not simulated or reduced for testing.
Normal runs skip the real-Prince test; fake executables require no Prince install.

`command.test.mjs` checks parsing, paths, help/version and diagnostic contracts.
`compile.test.mjs` checks delegation to the shared library compiler, CLI progress
formatting, awaited rejection and error/file-report presentation. Library tests
cover TOC/title orchestration; executable tests compare CLI and direct shared
compilation for all-entry and subset selections.
`executable.test.mjs` invokes the compiled Node entry and checks actual exit
status and streams, selected output, invalid input and renderer failures.
Temporary project copies isolate all generated files from the checked-in fixture.

`fixtures/project` and `expected/document.html` derive from the upgraded library's
trusted regression fixture and reviewed HTML baseline. The exact HTML expectation
includes the intended title-after-TOC behavior. Tests fix TZ=UTC, so no arbitrary
path/date normalization or snapshot regeneration is needed. Do not overwrite the
baseline just to make a failure pass; inspect semantic changes first. Source
fixtures, expected output and license text are excluded from formatting.

`pnpm run test:package` runs `tests/check-package.mjs`, a development/CI check
that packs through prepare, checks clean output and the runtime
file allowlist, installs the tarball outside both checkouts with scripts disabled,
and exercises the installed bin's help/version, fixture output and failure status.
It also exercises `pnpm install -g .` from the prepared checkout and global
archive installation in separate temporary PNPM_HOME directories. Both global
commands run outside the repository and check help/version and fixture output.
The temporary directories use canonical paths to avoid macOS /var alias issues.
Your normal global installation is untouched. It compares actual HTML to the
committed baseline and checks embedded assets.
Source keeps `file:../cross-doc`; the CLI tarball bundles the installed library
tree. Rebuild the sibling and reinstall the CLI after library changes. Standalone
Git dependency installation is not supported; no such success is claimed.

## Optional real PDF check

Install licensed Prince plus Poppler's `pdfinfo`, `pdftotext` and (for image
artifacts) `pdftoppm` on PATH, then run:

```sh
pnpm run test:pdf
# Retain PDF, HTML and page PNGs for review:
CROSS_DOC_PDF_ARTIFACTS=/tmp/cross-doc-cli-pdf pnpm run test:pdf
```

Opting in with missing tools fails, rather than silently skipping. Both project-root and out/ HTML locations are rendered to catch resource-base
regressions; retained artifacts use project-root/ and out-directory/ subfolders.
The fixture explicitly uses A4 and four section pages: people/map, events, character sheet
and timeline. Checks cover PDF signature, page count/geometry, representative
text and page placement. Review the rendered images for clipping, overlaps and
missing assets. Tests do not promise pixel-identical rendering across fonts or
Prince versions. Fake-PDF markers in routine tests are not real rendering evidence.

## CI layout and current boundary

`.github/workflows/validate.yml` checks out this repo into `cli` and cross-doc
into its sibling `cross-doc` directory. Both jobs intentionally check out the
latest `master` from dorward/cross-doc to detect compatibility divergence. Each
job logs the resolved library SHA, so failures can be traced to the exact
upstream revision tested. Build the sibling before installing the CLI snapshot.
The Linux/macOS matrix runs Node 24.22.0 and 26.12.0 with frozen installation,
package-manager checks, lint, formatting, strict checking, coverage,
packed-command validation and both audits.

CI does not pin, patch or fall back from upstream master. If master is
incompatible or has an outdated lockfile, the check should fail. Local results
in docs/validation.md describe the separately tested local library snapshot;
they do not establish that the current remote master passes. No hosted CI run
is claimed, and Windows is not yet validated.

Workflow dispatch optionally runs PDF validation on a trusted self-hosted runner
labelled `prince`, with Prince/Poppler installed, and uploads its review artifacts.
The self-hosted PDF job does not run on pull requests or weekly schedules.
Weekly Monday validation also checks upstream-master compatibility; an independent
audit job checks the committed full/production lockfile graph without a sibling
checkout. See [maintenance guidance](../docs/maintenance.md). No automatic external
tool installation or license provisioning occurs.

## Code-review item 7: structured diagnostics

Validated locally on 21 October 2026. The shared pipelines no longer print link
warnings; analyzeLinks returns stable code/severity/source/target records.
Successful results, onDiagnostics and CompilationError carry diagnostics. The
deprecated primitive retains its grouped stderr wrapper for compatibility.

- Library: 123 routine tests passed, two optional skipped. All 23 packed runtime
  exports and TypeScript declarations passed; unpacked/ASAR Electron consumers
  passed.
- CLI: 70 routine tests passed, two optional skipped, including injected-stream
  diagnostics before later failure and executable/subset behavior. Packed
  local/global installation and fixture compilation passed.
- GUI: 65 routine tests passed, one optional skipped. Oversized/invalid diagnostic
  payloads, omitted counts, renderer replacement/failure display and actual
  worker-to-preload success/failure transport passed. The extracted desktop ZIP
  passed standalone compilation, real Prince PDF and isolated preview checks.
- Types, lint and formatting passed in all packages. Full and production audits
  reported no known vulnerabilities in all three.
- Read-only Legends Walk inspection and actual Electron open/refresh showed 461
  entries and 47 diagnostics. Every displayed source/target matched the library
  records and legacy terminal report. No publishing into that checkout occurred.

No hosted CI, signing or publishing was performed.

## Code-review item 8: application policy and explicit graph output

Validated locally on 21 October 2026. writeGraph requires an explicit destination;
the deprecated generate_graph wrapper retains the test.dot fallback for 2.x,
scheduled for removal in the next major release. Normal compilation remains
graph-free. Theme/output defaults, CLI reporting and desktop policy remain in
their application adapters.

CLI reports use matching artifact kind/path phase facts alongside filesystem
observations. Unchanged files are not labelled Updated, completed artifacts
avoid false partial-file cautions after later failures, and changed files whose
phase was not started remain unverified. No atomicity or change-attribution
guarantee is implied.

125 library, 73 CLI and 65 GUI routine tests passed; five optional tests skipped.
Types, lint, formatting and full/production audits passed across all packages.
Packed library declarations/all 24 exports passed in Node and unpacked/ASAR
Electron. Packed CLI local/global installation and actual GUI Electron worker
smoke checks passed. A focused executable check confirms no default graph file
is generated during ordinary compilation. Hosted CI and distribution were not
run for this item; no GUI implementation change was needed.
