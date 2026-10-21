# Runtime and dependency baseline

Step 1 validated locally on 21 October 2026 with pnpm 12.14.0, npm 11.17.0,
and Node 24.22.0; resolution/audits also ran under Node
26.5.0. npm's registry confirmed pnpm 12.14.0 and its Node >=18 engine range.

- Imported package-lock.json with `pnpm import` before dependency changes;
  removed the npm lockfile after the import. The final lockfile resolves the
  sibling cross-doc directory through `file:../cross-doc`, as requested.
- After switching from the initial tarball approach, `pnpm install
  --frozen-lockfile` passed under Node 24.22.0 with the built upgraded sibling
  checkout present. The lockfile remained byte-for-byte unchanged.
- The installed sibling library imported through its public ESM root and
  exposed all 14 operations under Node 24.22.0. No vendor files remain.
- `pnpm run check:package-manager` passed with the exact pinned pnpm.
- In a disposable checkout, `npm install`, `npm ci`, `npm run build` and
  `npm run check:package-manager` each failed with EBADDEVENGINES naming pnpm.
  All checkout files were hashed before and after each command; nothing changed
  and no second lockfile or node_modules directory was created. The build
  command intentionally checks that the guard runs before script lookup;
  the CLI had no build script at that stage.
- The initial imported resolution reported one high finding at
  cross-doc > sass > source-map-js 1.0.2 (GHSA-68fv-2mgg-jv7q). A supported-range
  `pnpm update --depth 10` selected source-map-js 1.2.2 without an override.
  Commander moved from 9.4.0 to 9.5.0 within its existing ^9.4.0 range; its
  major-version migration remains a later step.
- Final full `pnpm audit --json` and production `pnpm audit --prod --json`
  both reported zero findings. An informational whatwg-encoding deprecation
  remains; no forced audit fixes were used.

At step 1, no CLI build, compilation, PDF, or remote CI success was claimed.
Step 3 results are recorded below. The sibling library must be
present and built before CLI installation; reinstall after rebuilding it to
refresh pnpm's local package snapshot. Standalone distribution will be addressed
in the later packaging step. No library commit was pushed or CLI release published.

## Step 2: command contract

Validated on 21 October 2026 with Vitest 5.0.5 and pnpm 12.14.0:

- All 35 adapter regression cases pass on Node 24.22.0 and 26.5.0.
- Frozen installation passes on pinned Node 24.22.0 after adding Vitest.
- Full and production audits report zero findings with the updated lockfile.
- `git diff --check` passes.

At step 2, tests invoked `src/command.mjs` with an injected compiler, not the
legacy executable or a real Prince process. Step 3 converts that module to
`src/command.ts` and adds the integration checks below. Import-side-effect validation uses a
separate Node subprocess. Actual compilation and process exit-code integration
were deferred to steps 3/5 at that stage. See [the contract](command-contract.md) for coverage and the
short-option migration rules. The sibling library dependency remains unchanged.

## Step 3: strict TypeScript and ESM pipeline

Validated on 21 October 2026 using TypeScript 7.0.2, @types/node 24.19.2,
Vitest 5.0.5 and pnpm 12.14.0:

- Strict type checking passes without skipLibCheck, broad any types or suppression
  directives. All application source is TypeScript, with checked indexed access,
  exact optional properties and NodeNext resolution. Native ESM is emitted with
  source maps, inline sources and explicit relative `.js` imports.
- Clean build and all 45 tests pass on Node 24.22.0 and 26.5.0. The pinned Node
  24 frozen install also passes. `pnpm test` builds first to ensure subprocesses
  exercise fresh output. Build/typecheck scripts were brought forward from
  step 4 to validate this migration; bin/publish packaging remains step 4.
- Compiled command, compiler and entry modules can be imported without starting
  compilation or parsing process arguments. Actual entry-point help/version
  succeed without a valid document project or loading the compiler.
- Real-library fixture compilation checks HTML content, embedded SVG and CSS,
  all three output paths, and the intentional TOC/title ordering correction:
  generated TOC links now receive title attributes such as `title="Alice"`.
- A delayed fake renderer writes a marker file; the command returns 0 after
  output completes. This tests process invocation and awaited file output,
  not real PDF rendering. Real Prince was not run for this step.
- Missing inputs, invalid includes and nonzero renderer exit return status 1
  through the compiled executable with quiet stdout and a single diagnostic
  without an unconditional stack trace. A unit integration test proves a later
  output rejection propagates and prevents early success.
- The updated sibling library sends its missing monoDirectionalLinks warning
  directly to stderr. The temporary CLI stdout redirect has been removed; the
  compiled-executable test still verifies stderr output and empty stdout.
  Link-check failures propagate without writing output. No sibling source
  files were changed by the CLI task.
- Full and production audits report zero findings. `git diff --check` passes.

The old CommonJS executable/options module are removed. The retained ESLint
configuration was renamed `.eslintrc.cjs` so its module.exports remains valid
under type: module; replacing ESLint configuration with Oxlint remains step 4.
Installed-bin/package-consumer checks, broader error fixtures, real PDF output,
and remote CI execution remain later steps. The requested `file:../cross-doc`
dependency is retained.

## Step 4: packaging and development checks

Validated locally on 21 October 2026 with Commander 15.0.0, Oxlint 1.89.0,
Oxfmt 0.74.0 and matching Vitest/V8 coverage 5.0.5:

- Frozen installation, lint, format checking, strict type checking and all
  45 tests pass on Node 24.22.0. Node 26.12.0 also passes strict checking,
  the complete test suite and packed-command verification.
- V8 coverage runs successfully: 80% statements and 82.53% lines. The compiler
  runner has 100% unit coverage; subprocess entry execution is not merged into
  this report, so the entry appears uncovered despite executable tests.
- A temporary invalid named import fails the native Oxlint import rule.
  The fixture tree is unchanged by the initial formatting pass. Lint rule
  differences and format boundaries are documented in tooling.md.
- prepare removes a deliberately stale dist marker and emits executable ESM.
  Archive inspection confirms intended project files plus the bundled library
  runtime tree, with no CLI source, tests, fixtures, build scripts or toolchain.
- In a temporary consumer with no sibling checkout, tarball installation with
  scripts disabled passes the installed bin's help/version and fixture
  compilation. The entry has its shebang and executable mode. HTML, embedded
  SVG and fake PDF marker are checked. Neither TypeScript nor library build
  permissions are needed. This uses fake Prince, not real PDF rendering.
- Source continues to use file:../cross-doc. Bundle metadata, rather than a
  vendor artifact or dependency URL replacement, makes tarballs self-contained
  with respect to the local library. Commander is fetched as a pinned registry
  dependency. Standalone Git dependency installation is not supported with the
  source sibling layout; the supported distribution route is a prepared tarball.
- Full and production audits report zero findings. No forced audit fixes or
  dependency hoisting exceptions were introduced.

These checks ran on macOS. Linux/Windows bundle behavior, broader failure cases,
real Prince and remote CI are not claimed; platform validation remains step 5.
No Git dependency installation or release was published. See tooling.md for the
Commander changelog review and packaging details.

## Step 5: expanded executable and distribution validation

Validated locally on 21 October 2026:

- 56 routine tests pass, including exact reviewed HTML comparison, malformed
  YAML/category JSON, invalid metadata/category sort, missing template/assets/
  theme/Prince, an unwritable HTML destination, selected includes and independent
  outputs. The compiled executable returns actual status 1 and keeps stdout
  empty on errors. The timeout test runs the real 30-second library timeout.
- Packed-bin checks additionally compare full HTML and verify invalid includes,
  missing project/Prince and malformed YAML through the installed executable.
  No sibling checkout is available to the isolated packed consumer.
- The baseline is copied from cross-doc’s reviewed fixture output, includes the
  intended TOC titles, and passes exactly with TZ=UTC. No fixture or expected
  output is regenerated during tests.
- Prince 17 and Poppler pass the opt-in CLI PDF check: four A4 pages, PDF text,
  representative map/events/character-sheet/timeline page placement, and actual
  PDF signature. All four 1200-pixel page PNGs were visually inspected: no
  clipped/overlapping text or missing map asset. Prince’s noncommercial license
  mark is expected. Review artifacts were retained in
  /private/tmp/cross-doc-cli-pdf-review. No real renderer installation occurred.
- Clean paired temporary snapshots pass frozen installation, package-manager
  checking, lint/format checks, strict checking, coverage, all 56 routine tests,
  isolated tarball checks, and both zero-finding audits on Node 24.22.0 and
  26.12.0. The CLI lockfile remains byte-for-byte unchanged. Logs are in
  /private/tmp/cross-doc-cli-step5-node-24.22.0.log and the corresponding
  26.12.0.log. The committed library lock prerequisite is detailed below.
- The Linux/macOS Node 24/26 workflow and opt-in trusted self-hosted PDF job are
  configured. Action versions/inputs were checked against their official
  repositories. YAML parses and its matrix and PDF dispatch condition were
  checked locally. No hosted workflow execution or Windows result is claimed.

### Upstream prerequisite found by the clean install

An unmodified export of cross-doc commit
`e21cd9ce19a07e95db293c3d9d69d905114b1d90` fails frozen installation with
ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE: its committed lockfile lacks
pnpm 12’s packageManagerDependencies section. Its existing uncommitted lockfile
already adds that metadata. For the successful clean-snapshot runs above, only
that existing corrected lockfile was copied into the temporary sibling export.
The check verified that the original dependency lock document is an unchanged
suffix; no dependency resolutions were rewritten. Neither source working tree
was changed by those validations.

The stderr-fix commit was not advertised by remote refs at the time of the
local validation. Per the requested CI policy, both hosted jobs now track
cross-doc’s latest master, rather than this local SHA, and record the resolved
commit in their logs. CI intentionally fails on upstream incompatibility or
lockfile drift; it does not patch master or use a pinned fallback. The local
clean-snapshot results above remain distinct from hosted compatibility results.
Standalone source Git installs remain unsupported; packed distribution is the
tested route. No hosted CI run or cross-platform execution is claimed.

## Step 6: documentation and maintenance automation

Implemented and checked locally on 21 October 2026:

- README now documents requirements, prepared-tarball installation, command
  options, defaults/paths, corrected aliases, includes/themes, exit/stream
  behavior, trusted input/resource handling and contributor/package checks.
  The fixture example was run in a temporary project with fake Prince and all
  three outputs verified; no checked-in fixture was modified.
- Local documentation links and referenced package scripts were checked.
  Maintenance guidance distinguishes local sibling development, packed
  distribution, fake-renderer evidence and optional real-PDF validation.
- Weekly Monday 07:21 UTC validation is configured. A separate scheduled/manual
  audit job runs without a sibling checkout or dependency installation, checks
  for alternate lockfiles, executes both full/production audits even if one
  fails, and fails the job if either scope fails. Both audit scopes passed with
  zero findings from a temporary directory containing only package/lock/config
  files, demonstrating independence from upstream-master compatibility.
- Dependabot configuration covers weekly registry and GitHub Actions updates,
  with cross-doc excluded to preserve file:../cross-doc. Minor/patch changes
  are grouped by dependency type; no automatic merge policy was added.
- The compatibility matrix still tracks upstream master. Its install order was
  corrected to build the sibling and install the CLI before invoking the
  package-manager script, since pnpm can implicitly install before running a
  script. Frozen installation and the existing guard remain enforced.
- Both YAML files parse. Structural checks verify schedule, master refs,
  independent audit behavior, failure aggregation, install order and update
  configuration. Formatting, lint and git diff --check pass.

Application code and dependency versions are unchanged by this step. The
previous 56-test, packed-bin and real-Prince evidence remains applicable; the
30-second suite was not rerun for documentation/configuration changes alone.
Hosted schedule execution, Dependabot PR generation, Linux/Windows results and
real-PDF CI dispatch are not claimed. These require the configuration on GitHub
and a compatible upstream master; the self-hosted PDF job also requires an
appropriately provisioned trusted runner. No release, push or account/settings
change was performed. All six implementation batches are recorded, with those
external execution boundaries retained.

## Direct global executable setup

`pnpm install -g .` works from the prepared checkout and exposes `cross-doc`.
No custom global-install script or intermediate archive is required. The
unnecessary install:global helper was removed after identifying a test-harness
path issue, rather than a problem with the package's bin metadata.

The initial global-registration test mixed macOS /var and /private/var paths.
Inspection showed pnpm-generated source symlinks pointing to nonexistent paths
such as /private/private/var. With canonical temporary paths, direct global
installation and execution outside the checkout pass on both pinned pnpm
12.14.0 and the user's current pnpm 12.6.0. Package validation now canonicalizes
its temporary root and checks direct checkout and archive global installation
separately, including help/version and fixture compilation. The real user global
installation and shell startup files remain untouched.

The checkout must already have its development dependencies and compiled dist
from normal installation/build. The global registration is a live source link;
rebuild after source edits and retain the checkout. A registry metadata lookup
returned E404 for cross-doc-cli on 21 October 2026; registry-name installation
still requires publication. Tarballs remain an optional standalone distribution
route, not a requirement for local global installation.

## Compilation file summaries

The CLI now reports CSS, HTML, PDF and embedded HTML results on stderr after
compilation, including failures. Before/after file metadata distinguishes new
or changed files from untouched existing outputs. Failed runs flag observed
changed files as potentially incomplete and explain missing/retained outputs;
file-inspection failures are unverified rather than reported as successful.
The original compiler error and nonzero status are preserved.

Strict type checking, lint, formatting and all 59 routine tests pass (the
opt-in real-Prince test remains skipped). Added subprocess cases cover repeated
success, retained old PDF/embedded files after failure, and partial PDF creation
by a failing renderer; existing missing-Prince checks assert which files were
created and which were not. Exact fixture HTML remains unchanged. Packed/local/
global installation checks also pass with the report enabled. No real PDF
rerender was needed because document generation/layout is unchanged.

## Shared library compiler migration

The CLI now delegates compilation to cross-doc compileProject, adapting structured
progress to its existing messages and retaining argument/path/exit/file-report
policy. All/subset executable tests compare output bytes with direct shared
compilation. Types, lint and all 69 routine tests pass, as do packed command,
isolated local/global installation and fixture checks. Both audits are clean;
there are no dependency/lockfile changes. Shared pipeline ordering and partial
artifact/cause behavior are covered in the library. Hosted CI remains pending.

## Feature parity item 2: read-only inspection and checks

Validated locally on 21 October 2026 with Node 26.5.0 and pnpm 12.14.0.

- 93 routine tests passed; two optional real-Prince tests skipped. Types, lint
  and formatting passed. Full and production audits reported no findings.
- New executable coverage checks deterministic versioned JSON, human streams,
  selection warnings and warning exits, missing/removed themes, invalid sources,
  conflicting flags, and executable availability without invoking Prince.
  Before/after project-tree comparisons confirm checks do not write outputs.
- Packed commands pass inspection/check in an isolated local consumer, plus
  existing local/global installation and compilation checks. Packaging rebuilds
  dist, so executable suites must run after packaging rather than concurrently.
- Read-only Legends Walk inspection reported 461 entries, seven categories,
  themes A5/book/card/personal/reduced and 47 warnings. Entry/theme/diagnostic
  sets match loadProject, the shared preparation underlying GUI Open/Refresh.
- No library/GUI runtime change, version bump, hosted CI, release publishing or
  publishing into the private project was performed.

## Feature parity item 5: optional PDF opening

Validated locally on 21 October 2026 with Node 26.5.0 and pnpm 12.14.0.

- 105 routine tests passed; two optional real-Prince tests skipped. Types, lint
  and formatting passed. Full/production audits reported no known vulnerabilities.
- Tests verify opt-in parsing, read-only rejection, output override resolution,
  waiting for compilation, opening once, no opening by default/on compilation
  failure, and preserving exit 0 plus empty stdout on startup failure.
- Mocked child processes verify macOS open, Linux xdg-open and Windows Explorer
  selection, one literal absolute path argument with spaces/Unicode/metacharacters,
  shell:false, unavailable launchers, nonzero/signal exits and unsupported OSes.
  A long-running launcher is detached after the startup window without killing it.
- Packed local/global installs and compilation checks passed. The tarball includes
  the compiled opener, and installed help documents --open-pdf. No tests launch
  real viewers; native viewer integration and Windows/Linux validation are not
  established by mocked platform tests.
- No library/GUI runtime change, dependency/version change, hosted CI or release
  publishing was performed. Later viewer failures are outside the one-second
  startup observation window and do not alter compilation status.
