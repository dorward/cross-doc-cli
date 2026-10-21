# cross-doc-cli upgrade plan

Prepared 21 October 2026. Step 1's local runtime/dependency baseline is
implemented using the requested sibling library dependency. Step 2's command
contract and regression tests and step 3’s typed ESM executable/pipeline are
implemented. Step 4’s packaging and development checks are implemented;
step 5’s expanded validation and CI configuration are implemented. Hosted CI
tracks the latest sibling master to detect compatibility divergence; its
execution is pending. Step 6’s documentation and maintenance automation are
implemented; no hosted execution or release is claimed.

This adapts [cross-doc's upgrade plan](../cross-doc/UPGRADE_PLAN.md) to this
two-module command-line application, using the upgraded library's
[public API](../cross-doc/docs/public-api.md), source and packaging contract.
The library's completed implementation steps are prerequisites and reference
material, not work to repeat here.

## Recommended direction

Adopt the library's Node baseline (currently >=24.22.0), pinned pnpm, native ESM,
strict TypeScript, Oxlint and Oxfmt. Build a small executable CLI that imports
only cross-doc's public package root. Keep Commander, upgrading it to a stable
release compatible with the chosen Node baseline. Do not add a JavaScript bundler, Babel, Electron, or a CommonJS compatibility
build. Package-level dependency bundling preserves the local source workflow.

The sibling checkout currently pins pnpm 12.14.0, TypeScript 7.0.2, Oxlint
1.89.0, Oxfmt 0.74.0 and Vitest 5.0.5. These are local reference versions,
not independently verified latest-release claims. At implementation time,
verify registry versions, engines and configuration requirements, then pin
the selected development toolchain and commit exact dependency resolutions.
Use Node 24 and 26 in CI, matching the library's supported validation lines.

## Repository findings

- `src/index.js` and `src/options.js` use CommonJS. The updated cross-doc exposes
  an ESM-only import entry, so the current `require('cross-doc')` must change.
- `type: "script"` is not a valid explicit Node module type. The minimum Node
  version is still >=13.7 and `engineStrict` does not provide useful enforcement.
- Only Commander and `file:../cross-doc` are direct dependencies. There are no
  declared development tools; `.eslintrc.js` is present without an ESLint script
  or direct dependency. Babel belongs to the old library dependency tree,
  not this application's build configuration.
- `package-lock.json` records the old sibling library and its obsolete tooling.
  It is not an accurate security baseline for the upgraded library. There is
  no pnpm lockfile, build configuration, test suite, fixture project or CI.
- A shebang exists, but no `bin` entry exposes an installed command. `main`
  points at the source executable, and `run` invokes it directly.
- Both project and PDF use `-p`; HTML uses `-h`, competing with conventional
  help. Parsing happens as an import side effect, and resolved options are
  dumped to stdout.
- The default basename uses the current working directory even when
  `--project` selects another project. String concatenation also mishandles
  absolute basenames and leaves relative-output semantics unclear.
- `output()` is asynchronous but is not awaited. The top-level promise has
  no explicit failure handler. New library validation and renderer failures
  therefore need deliberate CLI reporting and exit behavior.
- `generate_graph`, `dirname` and `fileURLToPath` are unused imports; graph
  generation is commented out. The library helper also adds the TOC before
  title attributes, whereas this CLI currently does the reverse.
- README installation is provisional and usage is undocumented.

## Ordered implementation batches

### 1. Establish a reproducible dependency and runtime baseline

Status: Node 24.22.0 and pnpm 12.14.0 are pinned; the npm guard, imported pnpm
lockfile and reviewed installation-script policy are implemented. Per the
requested local development workflow, cross-doc uses `file:../cross-doc`;
no vendor artifact is retained. See [validation](docs/validation.md).

- Pin the development Node version and pnpm version; set `engines.node` to
  the library-compatible baseline and remove `engineStrict`.
- Add `packageManager` and npm's `devEngines.packageManager` guard, following
  the sibling configuration. Test modern npm install/ci/run rejection in a
  disposable checkout, including that manifests and lockfiles remain unchanged.
  Document older npm and deliberate-bypass limitations. This is a repository
  development policy; packaged CLI users may use their preferred manager.
- Import the existing npm lockfile with `pnpm import` before changing
  dependencies. Remove package-lock.json and perform a clean pnpm install.
  Treat successful installation separately from a working legacy CLI: the
  latter is already incompatible with the ESM-only library.
- Use `file:../cross-doc` for the library dependency, as requested. Build the
  upgraded sibling library before installing the CLI and reinstall after
  library changes to refresh pnpm's package snapshot. Validate a frozen install
  with both checkouts present. A standalone distribution dependency can be
  selected and verified during the later packaging work.
- Inspect full and production audit results after resolving the upgraded tree.
  Record actual findings; do not copy the library's historical vulnerability
  counts or assume its clean audit guarantees this application's lockfile.

### 2. Specify the command contract and regression cases

Status: implemented. [The command contract](docs/command-contract.md) fixes the
short-option and path rules, includes/Prince semantics, streams and exit codes.
Vitest exercises the new side-effect-free command adapter with an injected
compiler. Step 3 connects the typed adapter to the compiler and adds real
HTML/embedding integration tests. Real PDF and installed-command validation
remain later steps.

- Keep existing long options (`--project`, `--base_name`, `--html_file_name`,
  `--embedded_html_file_name`, `--pdf_file_name`, `--theme`, `--include`). Reserve
  `-h` for help and `-p` for project. Assign and document nonconflicting output
  aliases, for example `-H` for HTML and `-P` for PDF. Explain the short-option
  corrections in migration notes; duplicate aliases cannot be preserved safely.
- Resolve project to an absolute path from invocation cwd. Derive the default
  basename as `out/<selected-project-directory-name>`. Resolve relative
  basenames and explicit output paths against the selected project; retain
  absolute paths as supplied. A basename supplies default filenames, while
  each explicit output filename overrides its corresponding default.
- Retain the `A5` default theme unless fixture/real-project checks establish
  that a deliberate change is needed. Preserve comma-separated includes;
  trim entries and reject empty elements with a useful usage error. Document
  that included items are library slugs, not filenames.
- Add `--prince_binary <file>` to pass through the library's executable option;
  default to `prince` on PATH. Resolve a supplied relative executable path
  against invocation cwd and explain that distinction from document paths.
- Use exit 0 for help/version and successful completion; exit 1 for invalid
  arguments, input failures or compilation/rendering failures. Send progress,
  warnings and errors to stderr. Remove the options dump and leave stdout
  empty for normal compilation. Give concise errors by default without an
  unconditional stack trace or duplicated library diagnostic.
- Keep the current all-output behavior: HTML, PDF and embedded HTML. Prince
  is therefore required for a normal run. HTML-only output would need an
  upstream API change and is outside this upgrade. Likewise, do not activate
  the commented-out graph feature as an incidental migration change.
- Add Vitest cases for these contracts before implementing behavior changes.
  Characterize defects as defects, rather than freezing them as compatibility
  requirements. Do not require the obsolete vulnerable library to run.

### 3. Convert the executable and pipeline to typed ESM

Status: implemented with TypeScript 7.0.2 and Node 24 declarations. All source
is strict TypeScript emitting native ESM; the old CommonJS source and options
side effects are removed. `dist/index.js` connects the command adapter to the
public library API, awaits output and assigns failure status without exiting
early. Build/typecheck scripts were added here to validate this migration.
The fixture verifies the intended TOC/title ordering correction. The updated
sibling library sends link warnings directly to stderr, so the temporary CLI
stream redirect has been removed. See [validation](docs/validation.md) for checks and limits.

- Set `type: "module"`. Convert the small source tree to TypeScript with
  NodeNext module/resolution, explicit `.js` relative imports, `node:` built-ins
  and a modern target compatible with the minimum runtime.
- Separate command construction/options normalization, the compilation runner,
  and a thin executable entry. Imports must not parse process arguments or
  start compilation. Pass argv/cwd and diagnostic writers into testable code
  where useful; avoid an elaborate framework.
- Import operations and public option types from `cross-doc`. Type normalized
  CLI options against `GenerateHtmlOptions` and `OutputOptions`; omit absent
  optional fields rather than using legacy null defaults. Enable strict
  checking, checked indexed access and exact optional properties without broad
  `any`, suppression directives or private deep imports.
- Follow the library helper's pipeline: read/parse/clean/enhance, check links,
  sort, generate HTML, replace placeholders, add TOC, add title attributes,
  then await output. Verify the TOC/title ordering with the fixture and record
  any intentional output correction.
- Catch failures at the executable boundary and set `process.exitCode = 1`.
  Await output so renderer failures are reported and success is only returned
  after all requested writes finish. Avoid premature `process.exit()`.
- Remove unused imports. Keep parsing/rendering/security logic in cross-doc;
  the CLI owns argument validation, orchestration and diagnostics.

### 4. Add executable packaging and development checks

Status: implemented with Commander 15.0.0, Oxlint 1.89.0, Oxfmt 0.74.0 and
matching Vitest V8 coverage 5.0.5. Clean builds mark the shebang entry executable;
prepare rebuilds before packing. The package exposes `cross-doc`, has no
programmatic main entry, and limits project files to dist/README/license.
The requested `file:../cross-doc` remains in source; bundledDependencies ships
its installed runtime tree in the CLI tarball. An isolated tarball install
without scripts, TypeScript or a sibling checkout passes help/version and real
HTML/embedding compilation with fake Prince. Git dependency installation is not
a supported standalone route while the source sibling dependency remains.
See [tooling](docs/tooling.md) and [validation](docs/validation.md).

- Build clean ESM into `dist` using TypeScript. Preserve the executable
  shebang and add `bin: { "cross-doc": "./dist/index.js" }` (or the final
  thin entry's equivalent). Verify the installed executable and file mode.
- Include only intended runtime files, README and license in the package.
  Remove the misleading source `main` entry unless a programmatic CLI API
  is deliberately supported. This executable does not need the library's
  declaration/public-export distribution contract.
- Add build/typecheck/test/watch/coverage, lint/lint:fix and format/format:check
  scripts, plus a development run command for the compiled executable.
  Use a tested prepare strategy so pack and supported Git installs build
  fresh output; packaged installation must not need TypeScript.
- Replace `.eslintrc.js` with explicit Oxlint correctness/import/Node rules.
  Add Oxfmt using the library's conventions (tabs, single quotes, semicolons,
  LF). Exclude generated files, lockfile, license and fixture baselines.
  Keep formatting changes separate from behavior changes where practical.
- Upgrade Commander after checking migration notes, Node requirements, option
  property naming, help and error behavior. Verify underscore long options
  still map to the expected normalized values. Do not add wrapper dependencies
  where Commander or Node already supplies the needed behavior.

### 5. Validate the actual installed command

Status: implemented locally, with hosted CI execution pending. Expanded
subprocess tests cover malformed YAML/categories, invalid metadata, missing
inputs/themes/assets/Prince, unwritable output, selected includes and the real
30-second renderer timeout. A committed reviewed HTML baseline and packed-bin
failure checks protect actual output and diagnostics. The optional real-Prince
check passes with Prince 17/Poppler, with four pages rendered and inspected.
Linux/macOS and Node 24/26 CI intentionally tracks cross-doc’s latest master
and records its resolved SHA to detect compatibility divergence. Upstream
incompatibility or lockfile drift should fail CI; no pinned fallback is used. Source Git installs
remain unsupported with the requested sibling dependency; packed installation
is the tested distribution route. See [test guidance](tests/README.md) and
[validation](docs/validation.md) for evidence and execution boundaries.

- Check option normalization with default/explicit projects, trailing slashes,
  relative/absolute output paths, spaces, Unicode, alternate themes and includes.
  Test missing values, unknown flags, conflicting aliases, help and version.
  Help/version must work without Prince or a valid document project.
- Check orchestration and awaited failures using focused mocks, then exercise
  subprocess exit codes and streams through the real executable. Cover missing
  projects/files, invalid YAML/categories, missing themes/assets, invalid include
  values, unwritable output and Prince missing/nonzero/timeout failures.
- Commit a small trusted fixture derived from the library fixture, including
  its template, SCSS, categories, links and embedded assets. Keep expected
  output independent of a sibling checkout and normalize only genuinely
  variable paths. Verify actual HTML and embedded content rather than merely
  checking that output files exist.
- Use a temporary fake Prince executable for routine process-boundary tests;
  make clear it verifies CLI invocation/failure handling, not PDF rendering.
  Keep a separate opt-in real-Prince integration run checking PDF text/page
  count and representative layout, with a documented external installation.
- Pack the CLI and install the tarball in an isolated temporary consumer,
  outside this repository and without `../cross-doc`. Invoke the generated
  `cross-doc` command, test help/version and compile the fixture. Confirm
  fresh dist, no source/build-tool requirement, and reproducible dependency
  resolution. Test the documented Git installation separately if retained.
- Run clean frozen installs, lint, formatting, type checking, tests, build
  and packed-command checks on Node 24 and 26. Add Linux/macOS CI; only claim
  Windows support once executable/path handling has passed there. Electron
  and ASAR tests remain the library/GUI's responsibility.
- Run full and production pnpm audits. Resolve findings through supported
  upgrades/replacements; record dependency paths and remediation for anything
  outstanding. Do not use forced audit fixes as the upgrade strategy.

### 6. Document and automate maintenance

Status: implemented. README covers prepared-tarball installation, all command
options, paths, example fixture use, trust/resource handling and contributor
checks. Maintenance guidance preserves the sibling source dependency and
upstream-master CI policy. Weekly full/production lockfile audits run in an
independent job; Dependabot is configured for registry and GitHub Actions
updates. The matrix builds the sibling and installs the CLI before running the
package-manager script, avoiding implicit pnpm installation in the wrong order.
Configuration, links, scripts and runnable examples were checked locally.
Hosted Actions/Dependabot operation and platform claims remain subject to the
execution boundaries in [validation](docs/validation.md).

- Replace provisional README text with installation, supported Node/runtime
  requirements, command help, examples, theme/include semantics, path rules,
  output filenames and exit behavior. Document the short-option corrections.
- Explain separate Prince installation/licensing, PATH and explicit executable
  configuration, network-disabled rendering, and possible partial HTML/CSS
  artifacts after a later PDF failure. Do not imply multi-file atomic output.
- Provide a usable fixture/example and explain that Markdown, templates and
  SCSS are trusted inputs; the CLI does not sandbox projects. Describe the
  library's contained embedded assets without promising broader isolation.
- Document pinned pnpm development commands, local sibling/tarball workflow,
  exact Git dependency build permissions, packed-install verification and
  optional real-PDF testing. Distinguish repository package-manager policy
  from end-user installation choices.
- Add frozen-install CI, package-manager/sole-lockfile checks, scheduled full
  and production audits, and dependency-update automation. Record validation
  results and any unexecuted remote CI or real-Prince checks explicitly.

## Completion criteria

The installed `cross-doc` command works without a sibling checkout and consumes
the upgraded library through its public ESM API. Help and options are documented,
aliases are unambiguous, paths follow the selected project, and failures return
a useful diagnostic and nonzero status. All output is awaited. Strict TypeScript,
lint, formatting, fixture and installed-package checks pass on supported Node
lines. pnpm is pinned, its lockfile is the sole lockfile, and both audits have
no unresolved findings. Real-PDF verification is recorded separately from mock
tests. No Electron migration or library rendering rewrite is required here.
