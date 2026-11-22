# shinba (心柱)

**Understand before you ship. A visual-first code editor built for responsible software design with coding agents.**

[![Status](https://img.shields.io/badge/status-early--development-orange.svg)](#roadmap)
[![Electron](https://img.shields.io/badge/Electron-TypeScript-47848F.svg)](#tech-stack)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

---

## Overview

**shinba** は、ビジネス要件の検討から設計、コーディング、テストまでを、ビジュアルに行き来しながら進めるデスクトップコードエディターです。

coding agent に実装を丸投げ（vibe coding）すればコードは素早く手に入りますが、
「なぜその設計になったのか」「どの例外ケースに対応しているのか」を人間が追えなくなるという課題があります。
特にアーキテクチャやレビューの経験を積んでいる途中のジュニアなエンジニアにとって、ブラックボックス化したコードの妥当性を判断することは容易ではありません。

**shinba** は、agent に作業を任せきりにするのではなく、
**人が要件を精査し、設計とコードの意味を理解したうえで責任を持って判断すること、また周辺アーキテクチャやよくあるレビュー観点を学習すること**を支えるために作られました。

---

## 設計資料

- [コンセプトと要件](docs/concept-and-requirements.md)
- [試作の引き継ぎ](docs/prototype-handoff.md)

これらの資料では、これまでに検討した内容と未決事項を整理しています。README の技術・機能の記述は、今後の設計で採用状況を確認します。

---

## Why "shinba"?

名前の由来は、法隆寺の五重塔など日本の伝統建築の中心を貫く大柱**「心柱（しんばしら / Shinbashira）」**です。
スカイツリーにも応用される耐震技術です。

五重塔は周囲の各層と心柱を剛結せず、独立した心柱が揺れを吸収することで、1300年以上にわたり大地震に耐えてきました。ソフトウェア開発においても、周囲の実装や要件、AIによる激しい時代の流れの中でも、中心に「理解と設計の軸」が通っていればシステム全体が破綻することはありません。

**shinba** は、コードを書く前の思考と設計の軸を据え、実装とテストをその軸に結びつけるための開発環境です。

---

## Core Features

### 1. Visual Design Boards（思考を整理するホワイトボード）
* 業務要件、ユースケース、データスキーマ、処理フロー、例外処理を複数のボードで整理・接続できます。
* 営業やデザイナーなど他業種との壁打ちとcodingがシームレスに連携できます。
* 確定した要件、採用した案とその理由、見送った案、未確認の前提を区別してボード上に残せます。
* AI を用いて「特定のケースを現在の設計に通すとどう振る舞うか」をシミュレーションし、実装前に設計漏れを検証できます。
* html+jsキャンバスを用いて、フロントエンドのmocをshinba内で作成できます。

### 2. Bidirectional Link: Board ↔ Code ↔ Spec（設計・コード・テストの双方向リンク）
* **Board → Code:** 設計ボード上の処理カードをクリックすると、対応する実装ファイルの該当行へ直接ジャンプします。
* **Code → Board:** 実装側で関数名やクラス名を変更すると、ボード上のカード名にも自動的に反映され、設計と実装の乖離を防ぎます。
* **Board ↔ Spec (TDD):** 処理カードから `spec/` 配下のテスト定義へ直接アクセスし、ケースごとの入力・事前状態・期待結果・実行結果を紐づけて管理できます。

### 3. Symbol-Level File Explorer（シンボルまで見えるツリー）
* フォルダやファイルだけでなく、ファイル内部に定義された `class`、`interface`、`function` まで展開して一覧表示します。
* コードベースの構造を俯瞰しながら、設計ボード上のコンポーネントとの対応関係を直感的に把握できます。

### 4. Local-First & Portable（`.shinba/` による状態管理）
* ボードデータや設計判断の記録はプロジェクト内の `.shinba/` ディレクトリに保存されます。
* 普段使いのエディターや CLI ベースの coding agent と併用しても競合せず、リポジトリとともに設計の履歴を管理できます。

---

## Development Workflow

**shinba** は以下のサイクルを自由に行き来しながら開発を進めることを想定しています。

1. **要件とユースケースの整理:** 誰が何を達成したいか、成功条件、前提・対象外を明確にする。
2. **ケースごとの振る舞い検討:** 正常系・代替フロー・失敗系を分け、入力・出力・状態変化を整理する。
3. **データと処理の設計:** スキーマ、処理順序、外部サービス連携、例外とその対策を検討する。
4. **アーキテクチャとコード構成の決定:** 複数案を比較し、採用・見送り理由を記録したうえでモジュール構成を設計する。
5. **実装とテストの検証:** ケースからテストを定義し、実装結果と設計を照らし合わせる（疑問が生じれば前のステップへ戻る）。

---

## Tech Stack

最小構成から構造を理解しながら育てるため、シンプルかつ拡張性の高い TypeScript ベースのスタックを採用しています。

* **Desktop Runtime:** Electron
* **Language:** TypeScript
* **Code Editor:** Monaco Editor
* **Visual Canvas:** Node-based / Freeform Canvas (React Flow / tldraw)
* **AST Parsing & File Watching:** `web-tree-sitter`, `chokidar`
* **Agent Integration:** Model Context Protocol (MCP) *(planned)*

---

## License

MIT License
