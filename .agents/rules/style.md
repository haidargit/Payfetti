# Style

## Comments

A comment carries only what the code cannot. Before writing one, cut it if it is:

- restating the line below it, or a name the reader can already see
- naming a library as justification ("matching OpenZeppelin")
- enumerating absences the file already demonstrates ("no owner, no payable")
- usage or operational instructions. Those belong in `docs/`
- spelling out what a keyword guarantees (`view` already means free)

What survives is the why: a non-obvious constraint, a gas trade-off, a failure mode,
a rule that must match somewhere else. Fragments are fine. Keep them short.

## Commits

One imperative line, under about 72 characters, no body. The diff shows what
changed. Add one or two lines of body only when the *why* is invisible in the diff,
such as a version pin working around an upstream bug, or the reason for a revert.

## Prose

Plain sentences. Avoid em-dashes unless genuinely needed, and prefer a comma, colon
or full stop. No decorative emoji in documentation; they are fine in CLI output.

State numbers only if they are measured, and say where they came from.
