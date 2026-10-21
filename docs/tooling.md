# Tooling and executable packaging

Use the pinned pnpm through the package scripts. `lint` treats warnings as
failures, `lint:fix` applies safe fixes, `format` writes formatting and
`format:check` checks it. Strict TypeScript remains a separate check.

## Lint and formatting migration

Oxlint 1.89.0 replaces the legacy ESLint configuration; this CLI never declared
ESLint or its import plugin directly. The checked-in config enables Node/modern
ES globals, correctness checks, explicit supported ESLint recommended rules,
native import checks and rejection of explicit any types. A temporary invalid
local named import was verified to fail `import/named` and then removed.

| Previous check                                | Replacement                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Recommended correctness rules                 | Explicit Oxlint rules plus correctness category                                                                           |
| Named/default/namespace/export validity       | Native import plugin                                                                                                      |
| `import/no-unresolved`                        | No equivalent native rule in this version; strict NodeNext type checking and executable/package tests exercise resolution |
| `no-new-symbol`                               | `no-new-native-nonconstructor`                                                                                            |
| Duplicate parameters and legacy octal         | ESM strict parsing                                                                                                        |
| Indentation, quotes, semicolons, line endings | Oxfmt                                                                                                                     |

This is an explicit migration, not a claim that the presets have identical
coverage. Oxfmt 0.74.0 uses tabs, single quotes, semicolons and LF. Embedded
language formatting is disabled. Generated dist/coverage, lockfile, fixtures,
expected output, backup files and license text are excluded. The initial
formatting pass only changes layout in existing source/tests; fixtures remain
unchanged.

## Commander migration

Commander is pinned to 15.0.0. Review of its
[9-to-15 changelog](https://github.com/tj/commander.js/blob/v15.0.0/CHANGELOG.md)
identified ESM-only packaging, the Node >=22.12.0 baseline, stricter duplicate
flag validation and default rejection of excess positional arguments. The CLI
already uses ESM, newer Node, unique single-character aliases, a fresh Command
instance and explicit excess-argument rejection. It uses no negated boolean
options, deprecated global default import or custom Help subclass. No adapter
behavior change was required. All long underscore option names, short aliases,
include parsing, help/version and error behavior pass the existing regression
suite under the new major.

## Builds, coverage and distribution

`build` cleans dist, invokes the local TypeScript compiler, then sets the entry
file mode to 0755. `prepare` uses the same build script. `run` builds and invokes
the compiled command. `test`, `test:watch` and `test:coverage` build first; rebuild
after source changes during watch mode to refresh subprocess test output.

V8 coverage includes all source modules and writes text plus HTML reports.
Subprocess execution is not merged into the Vitest coverage report, so the
thin entry reports no unit coverage despite its separate executable tests.
There is no artificial coverage threshold or claim of full path coverage.

The CLI package exposes only the `cross-doc` bin, not a supported JavaScript
import API. Its files allowlist includes dist; package metadata, README and
license are also packed. The source dependency stays `file:../cross-doc`, with
no vendor tarball. `bundleDependencies: ["cross-doc"]` makes pnpm pack include
the installed library and its runtime tree. Commander remains a normal pinned
registry dependency. The packed prepare hook is removed by pnpm, and consumers
need no compiler or source build permission.

`test:package` inserts a stale-output marker, packs through prepare, checks
contents and absence of development tools, then installs with scripts disabled
in a temporary consumer. It invokes the installed bin (including its executable
mode), checks help/version and compiles the trusted fixture with fake Prince.
The consumer has no sibling cross-doc checkout. This is tested on the local
macOS platform; Linux/macOS bundle checks are configured in CI, with hosted
execution pending. CI intentionally tracks the latest sibling master and logs
its resolved SHA to detect compatibility divergence. Optional native
dependencies in bundles warrant validation on each supported platform.

Rebuild the sibling and reinstall the CLI before packaging library changes.
Direct Git dependency installation is not a supported standalone installation
route while the sibling source dependency remains; use a prepared CLI tarball.
