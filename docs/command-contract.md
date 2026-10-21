# Command contract

The interface is implemented in `src/command.ts` and connected to the real
library through `src/compile.ts` and the thin `src/index.ts` entry point.
`pnpm run build` emits native ESM into `dist`; run `node dist/index.js --help`.
Adapter tests inject a compiler; integration tests execute the compiled entry
and real HTML/embedding pipeline with a fake Prince executable.

## Options

| Option                                 | Meaning                            | Default                                 |
| -------------------------------------- | ---------------------------------- | --------------------------------------- |
| `-p, --project <directory>`            | Project directory                  | Invocation cwd                          |
| `-b, --base_name <name>`               | Output basename, without extension | `out/<selected-project-directory-name>` |
| `-H, --html_file_name <file>`          | HTML output override               | `<basename>.html`                       |
| `-e, --embedded_html_file_name <file>` | Embedded HTML output override      | `<basename>-complete.html`              |
| `-P, --pdf_file_name <file>`           | PDF output override                | `<basename>.pdf`                        |
| `-t, --theme <name>`                   | Project theme                      | `A5`                                    |
| `-i, --include <items>`                | Comma-separated library slugs      | Everything                              |
| `--prince_binary <file>`               | Explicit executable path           | `prince` on PATH                        |
| `-h, --help`                           | Print help and finish              |                                         |
| `-V, --version`                        | Print package version and finish   |                                         |

All existing long option spellings, including underscores, remain supported.
`-p` now unambiguously selects the project; PDF uses `-P`. HTML moves from `-h`
to `-H`, reserving `-h` for help. Scripts should use the existing long spellings
or update their short options. Unknown options, unexpected positional arguments
and missing option values are usage errors.

Includes are document slugs, not filenames. Whitespace around each slug is
trimmed. An empty value or empty comma-separated element is an error, including
`alice,` or `alice, ,bob`. An omitted include field is absent from the compiler
options, rather than null or an empty array. The same applies to an omitted
Prince path so the library retains its PATH-based default. Explicit include
selections must be unique and match discovered document slugs. All unknown slugs
are reported, including mixed valid/unknown selections. Validation completes
before CSS/HTML/PDF writes or Prince invocation; existing outputs are retained
unchanged on selection failure.

## Paths and outputs

Resolve project against invocation cwd and normalize it to an absolute path.
Resolve relative basenames and output overrides against that selected project.
Preserve absolute paths. Local image and stylesheet references are rebased to
the actual HTML output directory before PDF rendering, including when a basename
places HTML directly at the project root or in a deeper directory. Each explicit
output filename overrides only its
corresponding default; it does not change other filenames or the basename.

For example, from `/work/cli`, `--project ../campaign` produces:

```text
/work/campaign/out/campaign.html
/work/campaign/out/campaign-complete.html
/work/campaign/out/campaign.pdf
```

Adding `--base_name editions/book --html_file_name previews/book.html` changes
HTML to `/work/campaign/previews/book.html`; the remaining outputs become
`/work/campaign/editions/book-complete.html` and
`/work/campaign/editions/book.pdf`.

An explicit relative Prince path is resolved against invocation cwd, so
`--prince_binary tools/prince` in this example means `/work/cli/tools/prince`.
To search PATH, omit the option. Paths with spaces and Unicode are single
argument values; normal shell quoting is required.

Every successful compilation writes HTML, PDF and embedded HTML. Prince must
be installed separately. There is no HTML-only switch or graph-output switch
in this upgrade. The `A5` theme default is retained; missing theme files are
compiler errors, not a reason to silently substitute a different theme.

## Completion and diagnostics

Help and version write to stdout, return 0 and never call the compiler; they
need neither a valid project nor Prince. Normal compilation leaves stdout
empty. Progress, warnings and errors go to stderr. Successful compilation
returns 0 only after the compiler promise resolves. Argument, project,
validation and rendering failures return 1. A concise compiler error is
reported once as `cross-doc: <message>`, without an unconditional stack trace;
Commander usage diagnostics are not printed a second time.

`runCommand` returns the status rather than exiting the process. The executable
assigns it to `process.exitCode`. Importing the command, compiler or entry module
does not parse arguments or compile anything. The compiler is dynamically loaded
only after parsing succeeds; help/version do not load the library. Errors propagate
to the command boundary for one diagnostic.

The library link checker writes its diagnostics directly to stderr. The CLI
calls it without redirecting or replacing process streams. Progress uses the
runner's supplied stderr writer; the executable regression test verifies that
link warnings reach stderr and leave stdout empty.

The pipeline follows the library helper: read, parse, clean, enhance metadata,
check links, sort, generate HTML, replace placeholders, add TOC, add title
attributes, then await output. The title pass now includes generated TOC links;
for example the fixture's TOC link to Alice gains `title="Alice"`. This is an
intentional correction from the old CLI's title-before-TOC ordering.

## Regression coverage

Run `pnpm test` or `pnpm run test:watch`. Vitest tests cover cwd and selected
project defaults; relative/absolute output and Prince paths; spaces, Unicode
and trailing slashes; old long spellings and corrected aliases; theme/include
values; help/version without compilation; invalid arguments; quiet stdout;
awaited completion; synchronous/asynchronous failures; and import side effects.
They specify intended behavior rather than preserving known legacy defects.
The committed trusted fixture is derived from cross-doc’s fixture. Integration
tests cover TOC titles, HTML and embedded assets, warning streams, awaited
output/rejections, actual Node exit codes, and missing input/renderer failures.
The fake renderer writes a marker, not a real PDF. The installed-bin check also verifies tarball contents, executable mode,
help/version and fixture compilation in an isolated consumer. Expanded error cases and the real timeout are covered by subprocess tests.
Real-Prince PDF validation is opt-in; Linux/macOS CI is configured, with hosted
execution pending. CI tracks the latest sibling master to detect divergence.

## File report

After a compilation attempt, stderr lists the planned CSS, HTML, PDF and embedded
HTML paths. Created/updated files are distinguished from missing outputs and
untouched pre-existing files. Missing outputs include the compilation failure
reason; a destination that is not a regular file is identified explicitly.
Help/version and invalid arguments do not start compilation or print a file report.

The CLI records file identity, size and nanosecond modification/change timestamps
before and after compilation. On failed runs, observed new/changed files are
labelled potentially incomplete: a renderer may create a partial PDF before
rejecting. Existing unchanged files are reported as not updated/retained. An
inspection failure is reported as unverified instead of inventing a success.
The library error still propagates, producing exit status 1 and its normal error
diagnostic. The file report does not roll back partial output or change stdout.

The CLI delegates preparation/output to cross-doc's compileProject API. It maps
structured progress into the existing stderr messages and retains argument/path
defaults, exit status and before/after file-report presentation. The shared
compiler preserves the original error message and cause; its conservative
artifact facts do not replace the CLI's filesystem inspection.

## Inspection and check results

--inspect and --check are mutually exclusive read-only modes. Both accept
--project, --include, explicit --theme, --json, --fail-on-warning and
--check-prince. --inspect prints project identity, categories, themes and entry
summaries; --check prints a count/warning summary. Both perform complete shared
preparation of the selected entries; neither validates final rendering,
templates/index.html, asset embedding, Sass compilation or Prince output.

Omitting --theme imposes no A5 or other theme requirement, including projects
with no discovered themes. Explicit themes must be available. Selections retain
the same unknown/duplicate/empty validation as compilation. Missing targets in
selected output are warnings relative to that selection, even when the target
exists elsewhere in the full project.

Read-only modes reject --base_name and individual output overrides. They reject
--prince_binary unless --check-prince is requested. --json, --fail-on-warning
and --check-prince require one of the read-only modes. Ordinary compilation
defaults and streams are unchanged. Help/version remain project-free.

--check-prince checks a canonical regular executable file without invoking it.
Explicit paths resolve from invocation cwd, as in compilation. Otherwise the
CLI searches PATH in order (relative/empty entries use invocation cwd); when
PATH is absent, the search defaults to /usr/bin:/bin. It does not use GUI
preferences or macOS desktop additions. File availability is not a version,
license, architecture or rendering check. If requested, it runs even when source
preparation fails so the result can report both failures.

### Streams and exit status

Human inspection/check output goes to stdout; link warnings and errors go to
stderr. No compilation progress or file report is produced. Exit 0 means source
preparation, explicit theme validation and any requested Prince availability
check passed. Link warnings alone permit exit 0. --fail-on-warning makes any
link warning exit 1; preparation/theme/Prince failures also exit 1.

For accepted read-only invocations, --json emits exactly one JSON object plus
newline on stdout and leaves stderr empty, including on project/check failures.
Parsing errors (unknown flags, missing operands, conflicting modes, invalid
include syntax or irrelevant options) are rejected before inspection, emit the
usual stderr diagnostic and exit 1 without a JSON result. Help/version print
their normal text even when combined with --json.

### Schema version 1

Every result has these required fields; null is used rather than omitted fields.

| Field          | Type and meaning                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| schemaVersion  | Integer 1; incompatible schema changes require a new version                                                                                     |
| mode           | "inspect" or "check"                                                                                                                             |
| ok             | Boolean; matches exit 0                                                                                                                          |
| project        | null if preparation failed; otherwise the summary below                                                                                          |
| diagnostics    | Array of {code, severity, source, target}; severity is "warning"; codes are missing-link-target, missing-reciprocal-link and unused-one-way-link |
| prince         | null if not requested; otherwise {ok:true,path:string} or {ok:false,error:string}                                                                |
| error          | Source preparation or explicit theme error string; null otherwise                                                                                |
| warningFailure | Boolean; true when --fail-on-warning was requested and diagnostics are nonempty                                                                  |

The project summary contains path (absolute selected project path), identity
(path relative to invocation cwd, or "."), categories (ordered {id,heading}
objects), entries ({slug,title,category} objects sorted by slug), and themes
(sorted strings). Category order follows the validated project configuration.
Entries use slugs, not source filenames; raw Markdown/HTML is not included.
A theme validation failure retains the prepared project summary. A failure
before preparation completes has project:null; any diagnostics already emitted
by link analysis remain available. Diagnostics sort by source, target and code.
String comparisons use UTF-16 code-unit order, not environment-dependent locale.

Example selected check with --fail-on-warning:

```json
{
  "schemaVersion": 1,
  "mode": "check",
  "ok": false,
  "project": {
    "path": "/work/campaign",
    "identity": ".",
    "categories": [{"id":"person","heading":"People"}],
    "entries": [{"slug":"alice","title":"Alice","category":"person"}],
    "themes": ["A5"]
  },
  "diagnostics": [{"code":"missing-link-target","severity":"warning","source":"alice","target":"bob"}],
  "prince": null,
  "error": null,
  "warningFailure": true
}
```

Consumers should check schemaVersion before interpreting fields, and ok together
with error, prince and warningFailure to distinguish failure causes. Identical
inputs and invocation context produce deterministic records; absolute paths and
project-relative identity naturally differ across machines/cwd.

## Optional PDF opening

--open-pdf sets an application-only compilation option, stripped before calling
the library. It is rejected with --inspect or --check; help/version do not open
anything. No implicit desktop action is added to ordinary compilation.

The CLI awaits compileProject and reports files before attempting to open a PDF.
It requires a completed PDF artifact matching the resolved requested output
filename, including a --pdf_file_name override. No launch occurs after input,
Prince, embedded-output or other compilation failures. An unexpected/unverified
PDF result produces an opening warning instead of launching another path.

The launcher uses spawn with shell:false, one literal absolute-path argument,
ignored stdio and a detached child:

| Platform        | Launcher                                           |
| --------------- | -------------------------------------------------- |
| macOS           | /usr/bin/open                                      |
| Linux           | xdg-open from PATH                                 |
| Windows         | explorer.exe under SystemRoot (default C:\Windows) |
| Other platforms | Opening warning; compilation stays successful      |

Startup errors and nonzero/signal exits observed within the startup window are
reported on stderr with the saved path. Launch failure does not invalidate
completed outputs or change compilation exit 0. Successful compilation still
leaves stdout empty. Some launchers wait for viewers to close, so after one
second the CLI stops waiting and releases the child without killing it. It
cannot establish viewer readiness or report later viewer/launcher failures.
There is no shell interpolation, Electron dependency, remote URL handling or
automatic opening outside this explicit flag.
