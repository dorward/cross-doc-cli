# Cross-Doc CLI

Compile a trusted collection of Markdown documents into linked HTML, embedded
HTML and PDF using [cross-doc](https://github.com/dorward/cross-doc).

## Requirements and installation

Use Node.js **24.22.0 or newer**. Development uses **pnpm 12.14.0**; install it
using the [pnpm instructions](https://pnpm.io/installation). Local validation
covers Node 24/26 on macOS; Linux/macOS CI is configured. Windows is not validated.

Install [Prince](https://www.princexml.com/download/) separately and meet its
licensing requirements. Use `prince` on PATH, or pass an executable path with
`--prince_binary`. Every compilation generates PDF as well as HTML, so Prince
is required for a normal run. Help/version do not need Prince or a project.

From a prepared CLI tarball, in a consuming project:

```sh
pnpm add /path/to/cross-doc-cli-1.0.0.tgz
pnpm exec cross-doc --help
```

The tarball includes compiled ESM and the bundled cross-doc runtime tree. It
needs neither a sibling source checkout nor TypeScript. Packaged consumers may
use their preferred package manager; repository development uses pinned pnpm.
No registry release or standalone Git installation is assumed.

## Global installation

From this prepared source checkout:

```sh
pnpm install -g .
cross-doc --help
```

This registers the checkout's `cross-doc` executable globally. Complete the
normal development installation below first so `dist` and dependencies exist.
After source edits, run `pnpm run build`; the globally linked command uses that
rebuilt output directly. For library changes, rebuild the sibling and reinstall
the CLI's dependencies. Keep this checkout in place while the global link is used.

A prepared tarball can also be installed with
`pnpm install -g /path/to/cross-doc-cli-1.0.0.tgz` when distributing a standalone
copy. The package name is `cross-doc-cli`; the command is **`cross-doc`**.
Installing by registry name requires publishing first; nothing is published by
local global installation.

If the command is not on PATH, run `pnpm setup` and restart your shell, then
inspect `pnpm bin -g`. Uninstall with `pnpm remove -g cross-doc-cli`.

## Usage

```sh
pnpm exec cross-doc --project /path/to/campaign --theme A5
pnpm exec cross-doc -p /path/to/campaign -t A5 -i 'alice,bob' -b out/selected
pnpm exec cross-doc -p /path/to/campaign --prince_binary '/opt/tools/Prince/prince'
```

A project contains `data/*.md`, `data/categories.json`, `templates/index.html`,
`templates/<theme>/index.scss` and any referenced assets in `resources/`.
Markdown entries need valid front matter including `title` and `type`.
See the complete [example fixture](tests/fixtures/project) and the library's
[API/input documentation](https://github.com/dorward/cross-doc).

| Option                                 | Default or purpose                                         |
| -------------------------------------- | ---------------------------------------------------------- |
| `-p, --project <directory>`            | Invocation cwd                                             |
| `-b, --base_name <name>`               | `out/<selected-project-directory-name>`, without extension |
| `-H, --html_file_name <file>`          | Override `<basename>.html`                                 |
| `-e, --embedded_html_file_name <file>` | Override `<basename>-complete.html`                        |
| `-P, --pdf_file_name <file>`           | Override `<basename>.pdf`                                  |
| `-t, --theme <name>`                   | `A5`; must exist in the project                            |
| `-i, --include <items>`                | Comma-separated library slugs, default everything          |
| `--open-pdf`                           | Open the completed PDF in the system viewer (opt-in)       |
| `--prince_binary <file>`               | Explicit executable path; omit to search PATH              |
| `-h, --help` / `-V, --version`         | Print help/version and finish                              |

Includes use slugs such as `alice`, not filenames such as `alice.md`. Whitespace
is trimmed; empty list elements are errors. Project is resolved from invocation
cwd. Relative basenames and output overrides use the selected project;
absolute paths remain absolute. Each output override affects only that output.
An explicit relative Prince path uses invocation cwd.

For project `/work/campaign`, the default files are
`/work/campaign/out/campaign.html`, `campaign-complete.html` and `campaign.pdf`.
HTML, PDF and embedded HTML are always requested; there is no HTML-only or graph
switch. Exit 0 means completion or help/version; exit 1 means argument/input/
rendering failure. Progress, warnings and errors use stderr. Normal compilation
leaves stdout empty. A final stderr file report lists CSS, HTML, PDF and embedded
HTML as created, updated, not created or not updated, with reasons for missing
outputs. On failure, changed files are flagged as potentially incomplete; old
files left untouched are identified as retained rather than newly generated.
Earlier HTML/CSS files can remain after a PDF failure;
output is not atomic. See [the full contract](docs/command-contract.md).

Old short options changed: `-p` now selects only the project, PDF uses `-P`, HTML
uses `-H`, and `-h` means help. Existing underscore long option names are retained.

## Try the example from a source checkout

After development setup below, copy the fixture before running it so generated
output does not modify the checked-in inputs. This example uses its `default`
theme rather than the CLI's `A5` default, and requires Prince:

```sh
example_dir=$(mktemp -d /tmp/cross-doc-example.XXXXXX)
cp -R tests/fixtures/project/. "$example_dir/"
node dist/index.js --project "$example_dir" --theme default --base_name out/example
# Outputs are in "$example_dir/out". Remove the temporary copy when finished.
```

## Input trust and PDF resources

Projects, Markdown/raw HTML, templates and SCSS must be trusted. The CLI does
not sanitize arbitrary HTML or sandbox Sass/Prince local file access. Prince
runs with network access disabled; JavaScript is disabled by default. Local
embedded assets must remain inside the project, including symlink targets.
External/data links remain unchanged; remote resources are not downloaded and
nested CSS resources are not recursively embedded. Containment of embedded
assets does not imply broader filesystem isolation.

## Development and packaging

Keep the upgraded library checkout at `../cross-doc` for the requested
`file:../cross-doc` dependency. From this CLI checkout:

```sh
(cd ../cross-doc && pnpm install --frozen-lockfile && pnpm run build)
pnpm install --frozen-lockfile
pnpm run check:package-manager
pnpm run lint
pnpm run format:check
pnpm run typecheck
pnpm test
pnpm run test:package
pnpm audit
pnpm audit --prod
```

Installation runs prepare and builds `dist`. Rebuild the sibling and reinstall
the CLI after library changes to refresh pnpm's local snapshot. `pnpm run build`
cleans/rebuilds executable ESM; `node dist/index.js --help` runs it directly.
`pnpm pack` builds a fresh installable tarball and bundles the installed library.
Review [maintenance guidance](docs/maintenance.md) before updating or packaging.

Commit only `pnpm-lock.yaml`. Modern npm rejects repository install/ci/run
commands through `devEngines.packageManager`; older npm or deliberate overrides
can bypass it. Dependency build permissions are explicitly reviewed in
`pnpm-workspace.yaml`; no source Git dependency build permission is needed for
the supported local-directory or prepared-tarball routes.

Use `pnpm run lint:fix` for safe lint fixes and `pnpm run format` for formatting.
`pnpm run test:coverage` writes `coverage/index.html`. Watch mode builds once;
rebuild after source edits to refresh subprocess tests. See [tooling](docs/tooling.md),
[tests and optional real PDF checks](tests/README.md), [validation results](docs/validation.md)
and [the completed implementation plan](UPGRADE_PLAN.md).

## Maintenance automation

CI tests against cross-doc's latest `master` and records its SHA to detect
compatibility divergence. Weekly Monday checks run the full matrix; a separate
job audits the committed full and production lockfile trees even if upstream
compatibility fails. Dependabot is configured for weekly registry dependency and
GitHub Actions updates. Hosted CI/Dependabot execution is not yet verified.

## Contributing and license

Pull requests are welcome. Discuss substantial changes before implementation.
Maintained by [David Dorward](https://github.com/dorward/). Licensed under
[ISC](LICENSE.md).

Link warnings come from structured library diagnostics; the CLI formats them
through the same stderr sink as progress. Source and target slugs are preserved,
and warnings remain visible if a later compilation stage fails.

The file report combines library artifact phase status with CLI before/after
filesystem inspection. Created/Updated requires an observed fingerprint change;
an unchanged existing file is reported as Not updated even after successful
compilation. A completed artifact is not labelled potentially incomplete merely
because a later phase failed. Unverified output still carries that caution.
These observations do not prove who changed a file or provide atomic writes.

## Inspect and check without publishing

```sh
cross-doc --inspect --project /path/to/project
cross-doc --inspect --json --project /path/to/project
cross-doc --check --include alice,bob --fail-on-warning
cross-doc --check --check-prince --prince_binary '/opt/tools/Prince/prince'
```

--inspect lists entry slugs/titles/categories, category headings and available
themes. --check reports source/link validation and a summary. Both use the same
preparation as the GUI, support --include, and leave CSS/documents unchanged.
Neither requires Prince or an A5 theme. An explicitly supplied --theme must exist.

--check-prince additionally checks whether the explicit executable or Prince on
PATH is an executable file; it never launches Prince and does not establish
version, license or rendering compatibility. --prince_binary is only meaningful
with --check-prince in these modes. Output overrides and conflicting modes are
rejected.

Warnings normally retain exit 0; --fail-on-warning makes them exit 1. Invalid
input or a failed requested Prince check also exits 1. --json emits one versioned
result on stdout, including diagnostics and failures, without progress/warnings
on stderr. Argument syntax/combination errors still use stderr and do not emit
a result. Help/version retain their usual output.
See the [JSON result contract](docs/command-contract.md#inspection-and-check-results).

## Open the completed PDF

```sh
cross-doc --project /path/to/project --theme A5 --open-pdf
```

--open-pdf is opt-in and valid only for compilation. After all document output
finishes, the CLI opens the completed PDF path in the system's associated viewer.
It uses macOS open, Linux xdg-open or Windows Explorer with an argument array;
filenames are never interpolated into a shell command.

An unavailable launcher or an opening error detected during startup prints a
warning and the saved PDF path on stderr. Compilation still exits 0, and stdout
remains empty. Failed compilation never launches a viewer, even if partial files
remain. Default runs never open a viewer; --inspect and --check reject this flag.

The CLI monitors launcher startup for up to one second, then detaches without
killing a launcher/viewer that is still running. Successful launch submission
does not prove the viewer loaded the PDF; errors after that startup window are
not reported by the CLI. This does not launch Electron or change PDF generation.

Configured vault projects are auto-detected through `publishing/project.json`; use
`--config-file publishing/custom.json` for an alternative root-relative configuration.
`--inspect` reports canonical vault-relative identities, and `--include` accepts those
identities (for example `notes/people/alice`) or explicitly recorded legacy aliases.
Duplicate selections after alias resolution fail. Projects without a configuration
keep the legacy layout, includes and output behavior. Configured CSS is generated beside
the chosen HTML destination. Markdown file links and Wikilinks now use the shared resolver, including heading links.
Inspection reports ambiguity candidates, missing headings, unpublished notes and
excluded targets separately. `--fail-on-warning` also covers these link diagnostics.
