# AGENTS.md

## このゲームが何なのか

- 架空企業「翠路ロジスティクス株式会社」の安全研修サイトを兼ねた、2D物流研修ブラウザゲーム。
- 正式なゲーム名は「積む。守る。届け切れ！」。
- パレット荷役、トラック積付け、固定、発車前点検、夜間高速配送を通して安全と利益を学ぶ。
- Unity製ではない。HTML/CSS/Vanilla JavaScriptのCanvas 2Dゲームで、任意のNode.jsサーバーを併設する。
- 外部ランタイム依存やビルド工程はない。`package.json`もない。

## 使用エンジン・主要技術

- エンジン: 独自Canvas 2D描画（Unity不使用）。
- 技術: HTML5、CSS、Vanilla JavaScript、Web Audio API、任意のNode.js HTTPサーバー。

## 作業開始時に必ず読む

1. `AGENTS.md`（本ファイル）
2. `docs/CURRENT_STATE.md`（直近の状態、既知の問題、テスト状況）
3. 今回の作業に必要なものだけを以下から読む。
   - 正式仕様: `docs/PROJECT_SPEC.md`
   - 技術構成: `docs/ARCHITECTURE.md`
   - 実変更履歴: `docs/CHANGELOG.md`
4. 実装根拠が必要なら`README.md`と対象ソースを直接確認する。
5. 無関係なファイルやプロジェクト全体を毎回再解析しない。

## 主要な入口

- UI/DOM: `index.html`, `css/style.css`
- ミッション定義: `js/stages.js`
- ゲーム本体: `js/game.js`
- 倉庫・配送拡張: `js/transport.js`
- 配置判定: `js/collision.js`
- 採点: `js/scoring.js`
- 進捗/UI: `js/ui.js`
- 入力: `js/input.js`, `js/main.js`
- 共有売上: `js/community.js`, `server.js`, `data/community-revenue.json`

## リポジトリと公開

- プロジェクトルートは編集用ソースを保持している。
- `.publish-tumikomi/`は既存GitHubリポジトリ`donadonaa24-cyber/tumikomi`の公開用チェックアウト。
- ルートの`.git`は有効な履歴元として扱わない。新しいGitリポジトリを初期化しない。
- 公開依頼時は既存リポジトリの`main`へ、意図したファイルだけを同期・確認して反映する。
- GitHub Pagesは静的配信のため、Node.jsの共有売上APIはそのままでは動かない。
- `AGENTS.md`、`docs/PROJECT_SPEC.md`、`docs/CURRENT_STATE.md`、`docs/CHANGELOG.md`、`docs/ARCHITECTURE.md`はソースと同じGitで管理する。
- `docs/ACTIVE_TASKS.md`は複数チャット間の一時作業調整用で、原則ローカルだけに置きGit管理しない。

## セキュリティとパス

- APIキー、アクセストークン、パスワード、秘密鍵、サービスのSecret、その他の認証情報を文書・ソース・Git履歴へ記載しない。
- Firebase、Supabase等を導入する場合もSecretをコミットせず、環境変数やホスティング側の秘密管理機能を使う。
- PC固有の個人情報を記録しない。
- 文書内のファイルパスは原則としてプロジェクトルート基準の相対パスにする。
- コミット前に、変更対象へ秘密情報やPC固有の絶対パスが混入していないことを確認する。

## 重要な禁止事項

- 既存機能、操作体系、ゲーム進行、レスポンシブ表示を無関係な変更で壊さない。
- 推測で仕様を追加・変更しない。不明点は調査し、判断できなければ「未確認」と記録する。
- UnityのScene、Prefab、C#が存在する前提で作業しない。
- `.publish-tumikomi/`を新規サイトや新規リポジトリへ置き換えない。
- `data/community-revenue.json`の実績値を理由なく編集しない。
- 実在企業と誤認させる住所・電話番号・応募窓口・実在人物情報を追加しない。
- 外部資料の文言や他社サイトをそのまま転載しない。
- ユーザーの未関連変更を削除・巻き戻ししない。

## 実装ルール

- 現行のグローバルIIFE構成と`index.html`のスクリプト読込順を確認してから変更する。
- `js/transport.js`は`Game.prototype`を後から拡張・上書きするため、`js/game.js`との二重定義に注意する。
- ゲーム内数値は実際の法令上の速度・処分を表すものではないという注記を維持する。
- 架空企業・架空人物・AI生成人物画像の免責表示を維持する。
- デスクトップとスマホの両UI、ポインター操作とWASD/矢印操作の両方への影響を確認する。

## テスト方針

- 小規模修正では、変更箇所に関連するテストだけを実行する。
- ドキュメントだけの修正では、コードテストを不必要に繰り返さない。
- 大規模更新、横断的なゲーム進行変更、またはリリース前だけフル回帰テストを行う。
- テストはNode.jsの単体スクリプトで、外部テストフレームワークは使わない。
- 主な関連テスト:
  - 基本荷役・積付け・採点: `node smoke-test.js`
  - 段積み・前後配置・配送: `node transport-test.js`
  - 配送10パターン: `node road-pattern-test.js`
  - 上段荷役と速度同期: `node pickup-motion-test.js`
  - 追越・左側通行: `node road-yield-test.js`
  - WASD・一時停止: `node keyboard-pause-test.js`
  - 上段の手動差込: `node pallet-assist-test.js`
  - ホーム/UI導線: `node homepage-smoke-test.js`
  - 共有売上API: `node server-test.js`
- 後段テストは前段テストを`require`して連鎖実行する。実行範囲を見積もって選ぶ。

## 作業完了時の必須確認

1. 実装とドキュメントに矛盾がないか確認する。
2. 開発状態が変わった場合は`docs/CURRENT_STATE.md`を現在の状態へ更新する。
3. 永続的な変更を行った場合は`docs/CHANGELOG.md`へ`YYYY-MM-DD`付きで追記する。
4. 仕様を変更した場合だけ`docs/PROJECT_SPEC.md`を更新する。
5. 技術構成を変更した場合だけ`docs/ARCHITECTURE.md`を更新する。
6. 作業ルールまたは参照先を変更した場合だけ`AGENTS.md`を更新する。
7. 変更していない内容を形式的に書き直さない。
8. 実行したテストと未確認事項を最終報告に明記する。
