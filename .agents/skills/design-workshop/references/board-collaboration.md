# Board collaboration and reference implementations

## Agent workflow

Ask for an exported version 2 JSON file, read the selected board and identify its case ID (`cases[].id`). The browser holds its own copy, so work on the latest export; a later import replaces the browser board. Tell the user to export again if they have continued editing. Do not change or replace the source export or existing cards. Create a separate output file and tell the user to import it via the board's JSON import control. A version 1 export must first be imported into the browser and re-exported as version 2.

Find reference code by first looking in the project's `sample-repos/` and `/sample-repos` when available, or in a path supplied by the user. These are examples, not requirements or proof of suitability. Search narrowly for the user's current case or schema, read enough context to understand behavior, and respect repository-specific instructions. Do not modify sample repositories. If unavailable or no relevant implementation is found, say so; never invent paths, behavior, citations, or claim exhaustive coverage.

Propose a small number of focused cards: use `suggestion` for a possible case or question, `schema` for a proposed data shape, and `reference` for existing knowledge or implementation. For each example identify source repository and file path with line numbers, explain what it does, when it may be relevant, tradeoffs, and what to verify. Separate observed behavior from inference; keep excerpts short and respect licenses. Clearly mark suggestions and illustrative schemas as unconfirmed, and ask the person to decide or explain their reasoning. Avoid presenting a sample as the correct answer.

Use `scripts/add_cards.py` to append cards safely. Write an additions JSON such as:

```json
{"board_id":"case-1","cards":[{"type":"suggestion","title":"検討候補: 二重送信","body":"同じ操作が繰り返された場合、何を期待しますか？ 未確認。"},{"type":"reference","title":"参考: 入力検証","body":"sample-repos/example/src/api.py:42 — 観察した処理と適用上の条件。"}]}
```

Then run `python3 <skill-dir>/scripts/add_cards.py --input <export.json> --additions <additions.json> --output <new-board.json>`. Choose a new output path; the script refuses to overwrite files and preserves existing cases, cards, images, and links. Explain that importing replaces the current browser copy and that an older export would discard subsequent browser edits.

## Code structure cards

A `codebase` card represents a proposed code structure, not actual files. Its body is an indented tree: directory names end in `/`, files sit beneath directories, and symbols may be written as `OpenAIClient (class)`, `Options (interface)`, or `createClient (function)` beneath a file. Review responsibility, boundaries, and the relationship to use cases before suggesting names or layers. Compare against the real project tree and conventions when available; clearly distinguish observed implementation from a proposed design. Do not create or modify files just because they appear on the board.

## Separate boards

Use separate boards for use-case discovery, schema, sequence, architecture, and other design questions when helpful. Keep stable case identifiers in related cards, so the person can trace a case across boards. Revisit cases as schemas and failure behavior become clearer. Do not force every stage or prescribe architecture; compare relevant options with examples and encourage the person to explain decisions. When the user is ready, help turn accepted decisions into code and tests.


## Running scenarios

A board may contain `scenarios` with an ID, name, input, before, and expected outcome. Process cards may have `parentId` referencing another process card in the same board; use that hierarchy when interpreting nested steps. A scenario with `cardId` is associated with that process card in the same board; read its body and connected cards as context. Scenarios without `cardId` apply to the board as a whole. When the user asks to run them, inspect the actual project, identify its entry point and existing tests, and use isolated local resources and suitable test doubles unless real external resources are explicitly intended and authorized. The user must be able to distinguish real implementation execution, a test double, and a conceptual simulation. Do not fabricate a passing result or assume that an S3 PUT checks for duplicates; inspect the implementation and report its behavior. If no implementation or executable test exists, mark the scenario blocked and explain what is missing; ask the user before choosing an unresolved business rule. Relevant sample repositories are references, not evidence of the target application's behavior.

Record what actually ran, the command or test name, observed output and state, and whether the expected result was met. Include the nature of storage used and any limitations. Return results to the browser by creating a new JSON file with `scripts/attach_results.py`. Prepare a separate report file, for example:

```json
{"board_id":"case-1","results":[{"scenario_id":"example-id","result":{"status":"blocked","summary":"実装を確認できませんでした","actual":"未実行","method":"実行なし","evidence":"対象の実装が未指定"}}]}
```

Run `python3 <skill-dir>/scripts/attach_results.py --input <export.json> --results <report.json> --output <new-board.json>`. Status is `passed`, `failed`, or `blocked`. The tool preserves the source and refuses to overwrite an existing output. Tell the user to import the output. The browser copy cannot be changed directly, and importing an old export would replace newer edits. Editing scenario inputs or expectations clears its old result. Never say a simulation is an execution of actual application code or a real external service.
