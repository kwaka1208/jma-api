# jma-api

気象庁防災情報 XML（PULL型）から、整理済みの JSON API を自動生成するシステムです。  
GitHub Actions が 5 分ごとに気象庁のフィードをポーリングし、新着の防災情報を取得・整理して REST API として公開します。

## 特徴

- **全国全件取り込み**: 気象庁の4つの高頻度フィード（定時・随時・地震火山・その他）をすべてカバー
- **条件付き GET**: `If-None-Match` / `If-Modified-Since` で気象庁サーバーへの負荷を最小化
- **重複排除**: 一度取得した電文は二度取得しない
- **JSON 形式**: 処理しやすい JSON で統一
- **アーカイブ機能**: すべての取得結果を時刻付きで保存

## データソース

| フィード | URL | 更新頻度 | 用途 |
|---------|-----|--------|------|
| 定時 | `feed/regular.xml` | 毎分 | 定時情報 |
| 随時 | `feed/extra.xml` | 毎分 | **警報・注意報（主用途）** |
| 地震火山 | `feed/eqvol.xml` | 毎分 | **地震・津波・火山（主用途）** |
| その他 | `feed/other.xml` | 毎分 | 台風情報等 |

**ベース URL**: `https://www.data.jma.go.jp/developer/xml/`

## セットアップ

### 必要環境
- Node.js 22 以上
- npm

### インストール

```bash
git clone https://github.com/kwaka1208/jma-api.git
cd jma-api
npm install
```

### clone 後の必須設定（latest.json の競合回避）

`api/latest.json` は GitHub Actions が 5 分ごとに上書きコミットするため、ローカルで
そのまま扱うと `git pull` / `merge` のたびに競合します。これを防ぐため、**clone 直後に
一度だけ** 次を実行してください。

```bash
git update-index --skip-worktree api/latest.json
```

これで latest.json のローカル変更が Git に無視され、競合が発生しなくなります。
`.gitignore` による除外は使えません（追跡済みかつリモート配信に必要なファイルのため、
除外すると raw API が壊れます）。

- この設定は**クローンごとにローカル限定**で、コミットされません。別マシンや clone し直した
  ときは再実行が必要です。
- 解除する場合: `git update-index --no-skip-worktree api/latest.json`

## 使用方法

### ローカルテスト

```bash
npm test
```

全ファイルのテストが実行されます（約30秒）。

### ローカルでの実行

```bash
node scripts/github-poll.js
```

API データを取得して `api/latest.json` を生成します。

## API エンドポイント

### 最新情報

```
https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/latest.json
```

最新の防災情報をまとめた JSON。毎5分ごとに更新されます。

### アーカイブ

```
https://raw.githubusercontent.com/kwaka1208/jma-api/main/api/archive/{YYYY-MM}/{timestamp}.json
```

過去の防災情報を時刻付きで保存。

## JSON スキーマ

```json
{
  "timestamp": "2026-07-29T10:15:00.000Z",
  "immediate": [
    {
      "timestamp": "2026-07-29T10:13:00.000Z",
      "reportId": "http://example.com/xml/20260729101300_0.xml",
      "reportTitle": "津波警報",
      "infoType": "発表",
      "eventID": "e20260729101300",
      "serialCount": 1,
      "changes": {
        "total": 1,
        "added": 1,
        "upgraded": 0,
        "downgraded": 0,
        "removed": 0
      },
      "areas": ["北海道", "青森県"]
    }
  ],
  "digest": [],
  "record": [],
  "summary": {
    "total": 1,
    "byLevel": {
      "immediate": 1,
      "digest": 0,
      "record": 0
    }
  }
}
```

### 各フィールドの説明

| フィールド | 説明 |
|-----------|------|
| `timestamp` | JSON 生成時刻（UTC） |
| `immediate` | 即時通知対象（特別警報、津波等） |
| `digest` | 集約通知対象（警報クラス） |
| `record` | 記録のみ（注意報、定時情報） |
| `reportId` | 電文 XML の URL |
| `reportTitle` | 情報名（「津波警報」など） |
| `infoType` | 発表/訂正/取消/遅延 |
| `eventID` | イベント ID（地震の続報は同一） |
| `serialCount` | 同一イベントの続報数 |
| `changes` | 前回状態からの変化（新規/格上げ/格下げ/解除） |
| `areas` | 対象地域 |

## 実装の詳細

### Poller（`src/poller/index.js`）

5 分ごとに実行される GitHub Actions から呼ばれます：

1. 4フィード（定時・随時・地震火山・その他）に条件付き GET
2. 新着エントリを検出（ETag/Last-Modified で 304 Not Modified 判定）
3. 重複排除（URL ハッシュで過去取得分を記録）

**重要**: Poller は電文**本体**を取りに行きません。電文本体の取得は Processor 側の責任です。毎分数十件流れるため、ここで直列取得するとタイムアウトします。

### Processor（`src/processor/index.js`）

ポーラーが検出した新着エントリを処理します：

1. 電文 XML を http でダウンロード
2. `fast-xml-parser` で解析
3. 府県予報区ごとの状態差分を計算（new/upgraded/downgraded/removed）
4. 深刻度に基づいて `immediate` / `digest` / `record` に分類
5. EventID でグループ化（同一イベントの続報は serialCount で表現）

### JSON 生成（`src/lib/api-builder.js`, `src/lib/json-builder.js`）

処理済み電文を JSON に変換：

- `immediate`: 即時通知対象（特別警報、津波等）
- `digest`: 集約通知対象（警報クラス）
- `record`: 記録のみ（注意報、定時情報）
- 状態差分と変化の履歴

### 状態管理（`src/lib/state-manager.js`）

府県予報区ごとの防災情報の現在状態を管理し、前回状態との差分を計算。
重複通知を防ぎ、状態遷移（新規→格上げ→解除）を正確に検知するための核となるモジュール。

## GitHub Actions

### `poll-jma.yml`

```
5分ごとに実行 (*/5 * * * *)
1. ノード環境セットアップ
2. npm install
3. node scripts/github-poll.js でデータ取得
   - フィード条件付き GET
   - 新着エントリ検出
   - 重複排除
   - 電文本体取得
   - 状態差分計算
   - 深刻度分類
4. api/latest.json を commit & push
5. api/archive/{YYYYMM}/{timestamp}.json にアーカイブ
```

手動実行も可能（`workflow_dispatch`）。

> **注意**: GitHub Actions のスケジュール実行はベストエフォートで、短間隔 cron は負荷時に
> 遅延・間引きされます。`*/5` でも実際には数分〜数十分の遅延やスキップが起こり得ます。
> また、リポジトリが 60 日間無活動（Actions bot のコミットは活動に含まれない）だと
> スケジュールは自動無効化されます。確実な定期実行が必要なら外部スケジューラの併用を検討してください。

## 開発上の注意

### 気象庁サーバーへのアクセス制限

1 日 10GB 以上のダウンロードが検知されると IP 遮断されます。開発時は以下を厳守してください：

- 条件付き GET を必ず使用（304 Not Modified で高速リターン）
- 一度取得した電文URL は二度取得しない
- ポーリング間隔は最短 1 分
- 電文取得の同時接続数は 5 程度に制限
- テスト中は `test/fixtures/` のフィクスチャを使用（実サーバーへアクセスしない）

### 体系変更への対応

2026 年 5 月 29 日に防災気象情報の体系が大きく変わりました：

- **旧体系（H27）**: `気象警報・注意報（Ｈ２７）` など
- **新体系（R06）**: `気象警報・注意報（Ｒ０６）（大雨）` など

本プロジェクトでは **R06 形式のみを対象** としています。

参照:
- [情報の取得方法](https://xml.kishou.go.jp/xmlpull.html)
- [技術資料](https://xml.kishou.go.jp/tec_material.html)
- [電文一覧](https://xml.kishou.go.jp/xmllist.pdf)
- [新体系について](https://www.jma.go.jp/jma/kishou/know/bosai/keiho-update2026/)

## テスト

### ユニットテスト

```bash
npm test
```

以下をカバー：

- Atom フィード解析（atom.js）
- HTTP 条件付き GET（feed.js）
- JSON 生成（json-builder.js）
- 重複排除（dedup.js）
- Poller 全体（poller.js）
- ストレージ操作（store.js）

### テストフィクスチャ

実フィードのサンプルが `test/fixtures/` に保存されており、テストはすべてこれを使用します。

## 関連プロジェクト

[**emergency-alert**](https://github.com/kwaka1208/emergency-alert)  
このリポジトリが生成した `latest.json` を消費し、電文を処理して Slack に通知するシステム。

## ライセンス

MIT

## 作者

[Kenichi Wakabayashi](https://github.com/kwaka1208)

## サポート

バグ報告・機能提案は [Issues](https://github.com/kwaka1208/jma-api/issues) までお願いします。
