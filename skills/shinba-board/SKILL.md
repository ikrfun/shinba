---
name: shinba-board
description: Read or edit shinba board cards and relationships with isolated CLI sessions, then save and resolve concurrent changes. Use when the user asks an agent to inspect or update a shinba project's board.
---

# Work with shinba boards

Use `shinba` in the project root, or pass `--project <project-path>`. Run `shinba --help` for current commands. The CLI emits JSON on success and reports errors on stderr.

Read only what the task needs: `shinba card list`, `shinba card show <id>`, and `shinba card related <id>`. These read the saved board; add `--session <id>` to read a draft. Layout is included in individual cards, so avoid loading the entire board when only titles or a few cards are needed.

For edits, start an isolated session with `shinba board begin main` and retain the returned `session` ID. Pass `--session <id>` to mutations. Use card IDs returned by the CLI, not title guesses. `card add`, `update`, `move`, `layout`, `connect`, `disconnect`, `delete`, and `link-symbol` operate on the draft. `--body-file <path>` is useful for multiline content; for nested cards, coordinates are parent-relative. Deleting a card requires removing its child cards and connections first.

Inspect `shinba board diff --session <id>` before `shinba board save --session <id>`. Saving merges against the current saved board. Exit code 2 means a conflict: the JSON result contains the base, draft, current values and a JSON-array `path` for each conflict. Preserve both sides, assess the user's intent, then use `shinba board resolve --session <id> --path '<JSON array>' --take working|current|custom`. For `custom`, add `--value-json '<valid JSON>'`; use `delete` to explicitly remove a conflicting value. Run `board save` again, and inspect any newly reported conflicts if the board changed meanwhile. Never resolve an ambiguous conflict by silently discarding the user's work.

A successful save changes the shared board and can update an open shinba window. `board abort` marks a session closed while retaining its files. Drafts under `.shinba/sessions/` may contain unsaved work; do not delete them merely because they are temporary. Direct edits to the board JSON do not participate in the CLI's lock and should be avoided during concurrent editing.
