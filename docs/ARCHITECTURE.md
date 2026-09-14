# ARCHITECTURE

最終確認日: 2026-09-14

## 1. 技術概要

- Unityバージョン: 該当なし。Unityプロジェクトではない。
- エンジン: 独自のCanvas 2D描画ループ。
- フロントエンド: HTML5、CSS、Vanilla JavaScript（IIFE、グローバル名前空間）。
- バックエンド: 任意のNode.js HTTPサーバー。Node標準モジュール`fs`、`http`、`path`のみ使用。
- ビルド: 不要。トランスパイル、バンドル、パッケージインストールなし。
- 外部ライブラリ: なし。
- テスト: Node.jsで直接実行する自作スクリプト。テストフレームワークなし。
- 今回確認したNode.js: `v24.19.0`。

## 2. Scene / Prefab / C#の対応

UnityのScene、Prefab、C#スクリプトは存在しない。相当する構成は以下。

| Unityでの概念 | 本プロジェクトの相当箇所 |
|---|---|
| Scene | `Game.mode`（menu/playing/event/driving/result）と`Game.phase`（pickup/loading） |
| Prefab/データアセット | `js/stages.js`のトラック・貨物・5ミッション定義 |
| MonoBehaviour | `js/game.js`の`Game`クラスと`js/transport.js`のprototype拡張 |
| UI Canvas | `index.html`のDOM UIと`gameCanvas` |
| Physics/Collider | `js/collision.js`と配送中の`roadContact` |
| PlayerPrefs | `js/ui.js`の`localStorage`進捗 |

## 3. 実行時構成

`index.html`は次の順序でスクリプトを`defer`読込する。

1. `js/stages.js` → `window.StageData`
2. `js/collision.js` → `window.Collision`
3. `js/scoring.js` → `window.Scoring`
4. `js/audio.js` → `window.Sfx`
5. `js/community.js` → `window.CommunityRevenue`
6. `js/ui.js` → `window.UI`
7. `js/game.js` → `window.Game`
8. `js/transport.js` → `Game.prototype`を倉庫・配送向けに拡張/上書き
9. `js/input.js` → `window.GameInput`
10. `js/main.js` → DOM初期化、ゲーム生成、入力とボタンの接続、表示サイズ調整

読込順は依存関係そのものなので、順序変更時は全体への影響を確認する。

## 4. 主要フォルダ

- `assets/images/` — ホーム用人物・作業画像、倉庫背景、フォークリフト、トラック、道路、一般車、パトカーのPNG。
- `css/` — `style.css`のみ。企業ホーム、ゲーム、PC/モバイル、仮想パッドを一括管理。
- `js/` — ゲームデータ、描画、入力、判定、採点、UI、音、通信。
- `data/` — Nodeサーバー用の共有安全売上JSON台帳。
- `docs/` — 正式仕様、現在状態、変更履歴、技術構成。
- `.publish-tumikomi/` — 既存GitHub公開用チェックアウト。編集用ソースと混同しない。
- `.gitignore` — ローカル一時ファイル`docs/ACTIVE_TASKS.md`をGit管理から除外。

基幹文書`AGENTS.md`、`docs/PROJECT_SPEC.md`、`docs/CURRENT_STATE.md`、`docs/CHANGELOG.md`、`docs/ARCHITECTURE.md`は、ソースコードと同じGitHubリポジトリで管理する。`docs/ACTIVE_TASKS.md`は複数Codexチャット間の一時調整専用で、公開が明示的に必要な場合を除きコミットしない。

## 5. 重要なスクリプトと各システムの役割

### `js/stages.js`

- 貨物生成関数、色、重量、運賃、代替費用、耐荷重、取扱属性を定義。
- 5ミッション、トラック荷室寸法、最大積載量、制限時間、資材数、目標売上を保持。
- キャンペーン目標145,000円を保持。

### `js/game.js`

- `Game`クラス、アニメーションループ、Canvas描画、状態遷移を担当。
- 荷役の基本操作、積付けドラッグ、回転、Undo、資材使用、点検、出発、結果遷移を担当。
- 内部Canvasは1280×720固定。

### `js/transport.js`

- `Game.prototype`を後付けで拡張する。既存メソッドをラップまたは上書きする箇所がある。
- 段積み、前後配置、手動パレット差込、転倒・奥貨物破損を担当。
- 夜間配送10パターン、車速、交通、工事・障害物、衝突、パトカー、追越、左側通行、一時停止、道路描画を担当。
- `js/game.js`と同名メソッドがある場合、後から読み込まれる本ファイル側が最終挙動になる。

### `js/collision.js`

- 回転後寸法、矩形重なり、荷室境界、床/他貨物による支持率を計算。
- 配置位置をスナップし、重なり・荷室外・支持不足を拒否する。

### `js/scoring.js`

- 積載重量、前後重心、高重心、耐荷重、破損厳禁、固定、支持、配送順を分析。
- 資材費、破損損失、遅延損失、安全点、ランク、安全売上、基本合否を計算。

### `js/ui.js`

- ホーム、ミッション一覧、ヘルプ、点検、結果モーダルを管理。
- `localStorage`進捗を読書きし、クリア時の解放・ベスト記録・キャンペーン合計を更新。
- 3枚のホームカルーセルとWeb/モバイル表示モードを制御。

### `js/input.js` / `js/main.js`

- `input.js`: Canvasポインター、積付け用R/Z/1/2/3/Iキー。
- `main.js`: DOMContentLoaded時の生成、WASD/矢印/Space/P/Esc、仮想パッド、各ボタン、1280×720の縮小表示を接続。

### `js/audio.js`

- Web Audio APIで効果音を合成する。音声ファイルへの依存はない。

### `js/community.js` / `server.js`

- `community.js`: 同一オリジン`/api/community-revenue`を15秒ごと・表示復帰時・オンライン復帰時に取得。クリア売上をPOST。
- `server.js`: 静的ファイル配信と共有売上API。入力上限、Content-Type、便ID、売上上限、完了IDを検証。
- 台帳、`server.js`、作業ファイルは静的配信対象外。

## 6. データ保存方式

### 個人進捗

- 保存先: ブラウザ`localStorage`
- キー: `tsumeru-game-progress-v2`
- 内容: 解放/完了ミッション、最高得点、最高ランク、最高安全売上、効果音設定。
- 途中の積付け状態は保存しない。

### 共有売上

- 保存先: `data/community-revenue.json`
- 内容: `totalRevenue`、`deliveries`、`updatedAt`、直近の完了ID。
- 書込み: 一時ファイル作成後のrenameで更新。
- 制約: 単一Nodeプロセスとローカルファイル前提。DB、排他制御、複数インスタンス対応はない。

## 7. 外部サービスとMCP

- GitHub: 公開用チェックアウトのremoteは`https://github.com/donadonaa24-cyber/tumikomi.git`、ブランチは`main`。
- GitHub Pages: 静的Web版を公開。Node APIは実行しない。
- Firebase/Supabase: 導入なし。
- CDN、解析、広告、認証サービス: 導入を確認できない。
- MCP: ランタイムコード、設定ファイル、ビルドにMCP依存はない。プロジェクト固有のMCP設定も確認できない。
- 画像生成のプロンプト記録は`IMAGE-PROMPTS.md`にあるが、生成時に使ったサービス/MCPはコードからは未確認。

## 8. 主要Package

- npm package: なし。
- `package.json` / lockfile: なし。
- Node側依存: 標準`fs`、`http`、`path`のみ。
- ブラウザAPI: Canvas 2D、Pointer Events、Web Audio API、Fetch、AbortController、localStorage、ResizeObserver、Visual Viewport。

## 9. ビルド・起動・公開

- ビルド工程: なし。
- API付きローカル起動: プロジェクトルートで`node server.js`、既定`127.0.0.1:8000`。
- 静的起動: 任意の静的HTTPサーバーまたは`index.html`。静的起動では共有売上APIはオフライン表示。
- テスト: 各`*-test.js`をNode.jsで直接実行。
- 公開: `.publish-tumikomi/`から既存GitHubリポジトリの`main`へ反映し、GitHub Pagesで配信する運用。

## 10. 対応状況

| 対象 | 状況 |
|---|---|
| Web | 対応。主要実装対象。 |
| Windows | Node.js `v24.19.0`で自動テスト成功。ブラウザで動作する。 |
| Android | モバイルUI実装済み。実機・ブラウザ別の最新確認は未確認。 |
| iOS | モバイルUI実装済み。実機・Safariでの最新確認は未確認。 |
| macOS/Linux | Web技術上の専用分岐なし。実機確認は未確認。 |
| Unity/ネイティブWindows | 非対応。 |

## 11. 重要な依存関係と変更時の注意

- `StageData` → `Collision` → `Scoring` → `Game/UI`の順でデータが流れる。
- `transport.js`が`Game.prototype`を変更するため、`game.js`だけ読んで最終挙動を判断しない。
- 荷物の状態フラグ（`transported`、`placed`、`forkDamaged`、各固定フラグ）は荷役、点検、採点、保存表示を横断する。
- 点検後に積荷を変更すると`invalidateInspection`で再点検が必要になる。
- 配送結果は積付け時の`Scoring.calculate`結果を`transport.js`が到着時に追加補正する。
- レスポンシブ表示はDOM操作パネルの高さを引いてCanvas全体を16:9で縮小する。Canvas内部座標は変更しない。
- `homepage-smoke-test.js`は企業名、架空免責、募集停止文言、3画像、Web/スマホ導線を契約として検査する。
