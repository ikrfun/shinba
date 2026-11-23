# Board と CLI の使い方

## 作業コピー

shinba はプロジェクトの `.shinba/boards/main.json` に共有ボードを保存します。画面と CLI はそれぞれ `.shinba/sessions/<session-id>/state.json` に、編集開始時の基準と作業中のボード全体を保持します。作業コピーを Git に含めない場合は、各プロジェクトで `.shinba/sessions/` を追跡対象から外してください。未反映の変更が残るため、自動的に削除しないでください。

画面上の変更は作業コピーへ自動保存されます。通常モードで `:w` を実行するか Save board を押すと、共有ボードへ変更を反映します。プロジェクトを開き直すと、前回の作業コピーを復元します。

通常モードで `i` を押すとカードの本文やタイトルを編集でき、`Esc` で通常モードに戻ります。通常モードではテキスト上からカードをドラッグできます。`:` でコマンドを入力し、`Enter` で実行します。`:ac` で通常カード、`:ac html` で HTML プレビュー付きカードを表示領域の中央に追加します。HTML プレビューはサンドボックス内で表示し、スクリプトや外部リソースは利用しません。

## CLI

インストール済みの `shinba` を使うか、開発用チェックアウトから `node app/cli/shinba.cjs` を使います。プロジェクトのルートで実行するか、`--project <path>` を指定します。`shinba --help` でコマンドを確認できます。

```sh
shinba card list
shinba board begin main
# begin の出力にある session ID を以後の --session に指定する
shinba card add --session <id> --title '設計案' --body-file /tmp/body.txt
shinba board diff --session <id>
shinba board save --session <id>
```

`card list`、`show`、`related` は共有ボードを読み取ります。`--session` を指定すると作業コピーを読み取ります。追加、編集、移動、レイアウト、接続、接続解除、削除、コードシンボルのリンクは `--session` が必要です。親カードを指定した場合の座標は親からの相対座標です。子カードまたは接続が残るカードは削除できません。

`board abort --session <id>` はセッションを終了状態にします。作業ファイルは残ります。

## 外部変更と競合

画面と CLI は基準・作業コピー・現在の共有ボードを比較します。カードやフィールドが異なる変更は統合します。画面の入力中に外部変更を検知した場合は、入力欄からフォーカスが外れてから更新を照合します。競合する変更は作業コピーに残り、画面で両方を確認できます。

競合があると `board save` は共有ボードに書き込まず、終了コード 2 と JSON の `conflicts` を返します。各項目の `path` は JSON 配列です。内容を確認し、作業側、共有ボード側、または自分で編集した値を選んでから再保存します。

```sh
shinba board resolve --session <id> --path '["nodes","card-id","data","body"]' --take working
shinba board save --session <id>
```

`--take` は `working`、`current`、`custom`、`delete` から選びます。`custom` は `--value-json` に JSON 値を指定します。共有ボードが解消後に変わっていた場合は再比較し、必要なら新たな競合を返します。

CLI と画面の保存は共通のロックを使い、ファイルを一時ファイルから置き換えます。直接 JSON を書き換えるツールはこのロックに従わないため、同時書き込みを防げません。CLI を利用してください。
