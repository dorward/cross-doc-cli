# Maintenance and release checks

Use Node >=24.22.0 and the exact packageManager version in package.json.
pnpm-lock.yaml is the sole lockfile. Runtime/type/tool versions and actual local
results are recorded in validation.md; neither a passing local test nor authored
CI configuration proves that a hosted job has run.

## Dependency updates

Dependabot checks registry dependencies and GitHub Actions weekly on Monday at
07:00 Europe/London. Minor/patch changes are grouped by production/development;
major updates remain separate review items. The local cross-doc dependency is
excluded and must stay file:../cross-doc. There is no automatic merge policy.
Version-update PR generation, including support for this lockfile format and
local dependency layout, must be confirmed after the configuration reaches GitHub.

Review proposed changes and regenerate the lock with pinned pnpm if the service
cannot update it. Do not accept a second lockfile, changed local-library URL,
broad hoisting, forced audit fixes or unreviewed dependency build scripts.
Keep Vitest and @vitest/coverage-v8 at matching versions. When updating pnpm,
also update packageManager/devEngines, installation instructions, and the tested
lockfile metadata. When updating Node pins, align .node-version, engines and CI
deliberately. Recheck compiler/linter behavior rather than blindly updating pins.

For library changes, build the sibling, reinstall the CLI and run the full
quality/test/package checks. This refreshes pnpm's local snapshot. Do not copy
the sibling's node_modules or patch its output into the installed CLI.

## Security and compatibility monitoring

The validation workflow runs weekly Monday at 07:21 UTC as well as on pushes,
pull requests and manual dispatch. Its matrix checks the latest cross-doc
master on Linux/macOS with Node 24/26, recording the exact library commit. A
failure after upstream changes is a compatibility signal; reproduce against
the logged SHA and fix the incompatibility or upstream lockfile. Do not hide it
with a pinned fallback or a non-frozen install.

The independent scheduled/manual audit job checks the committed lockfile without
installing dependencies or checking out cross-doc. Both full and production
audits run even if the first fails, and any failed audit fails the job. This
monitors the locked graph separately from the upstream-master integration job.
Investigate dependency paths and update supported parents; record any unresolved
finding and remediation instead of declaring security checks clean.

GitHub schedules run from the default branch and can be delayed. These jobs
and Dependabot must reach the default branch before hosted operation can be
verified. No workflow dispatch, PR, release or repository settings change is
performed by adding these files.

## Global installation from a checkout

After the normal development installation/build, run `pnpm install -g .`.
The installed command is `cross-doc`; uninstall with `pnpm remove -g cross-doc-cli`.
This links the checkout, so rebuild after source changes and keep the checkout
in place. Refresh the local dependency snapshot after sibling-library changes.
No tarball or custom installer is required for this workflow.

A prepared tarball remains the standalone distribution route. Registry-name
installation requires publication. Configure the pnpm global bin PATH with
`pnpm setup` if needed. Tests cover direct checkout and archive installation in
separate temporary pnpm homes, leaving the user's real global packages alone.
Canonicalize temporary paths with realpath: mixed macOS /var and /private/var
paths can make pnpm generate broken relative source-package symlinks.

## Before distributing a tarball

1. Build the desired sibling library revision and record its SHA in release
   notes. Reinstall the CLI so its local dependency snapshot is current.
2. Run frozen installation, package-manager checking, lint, format:check,
   typecheck, tests/coverage, test:package, full audit and production audit.
3. With licensed Prince and Poppler installed, run test:pdf and inspect all
   rendered pages. Set CROSS_DOC_PDF_ARTIFACTS to keep PDF/HTML/PNG evidence.
4. Run pnpm pack. The prepare hook rebuilds fresh executable ESM and the bundle
   includes the installed cross-doc runtime tree, not a sibling pathname at
   installation time. Retest the packed bin on every claimed target platform;
   optional native packages make host-only packaging evidence insufficient for
   a universal platform-support claim.
5. Install the tarball in an isolated consumer, exercise help/version and a
   real project, and record the library/runtime/Prince versions and results.

test:package already checks fresh output, the runtime file allowlist, executable
mode, installed help/version, exact fixture HTML, embedded assets and failure
status without a sibling checkout or compiler. Routine fake renderer output
does not replace the real PDF check. Standalone source Git installation remains
unsupported with this sibling dependency; no Git build permissions or registry
release are assumed. Publishing is a separate action.
