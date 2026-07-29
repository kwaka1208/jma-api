# jma-api

気象庁防災情報 XML（PULL型）から、整理済みの JSON API を自動生成するシステムです。  
毎5分ごとに気象庁のフィードをポーリングし、新着の防災情報を取得・整理して REST API として公開します。

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
  "timestamp": "2026-07-29T10:15:00Z",
  "feeds": [
    {
      "feed": "extra",
      "count": 12,
      "entries": [
        {
          "id": "http://example.com/entry/1",
          "title": "気象警報・注意報（Ｒ０６）（大雨）",
          "updated": "2026-07-29T10:15:00Z",
          "link": "http://example.com/report/1",
          "published": "2026-07-29T10:15:00Z"
        }
      ]
    }
  ],
  "summary": {
    "totalFeeds": 4,
    "totalNewEntries": 45
  }
}
```

## 実装の詳細

### Poller（`src/poller/index.js`）

毎5分実行される GCP Cloud Scheduler から呼ばれます：

1. 4フィード（定時・随時・地震火山・その他）に条件付き GET
2. 新着エントリを検出（ETag/Last-Modified で 304 Not Modified 判定）
3. 重複排除（SHA-1 ハッシュで過去取得分を記録）
4. JSON 生成

**重要**: Poller は電文**本体**を取りに行きません。電文本体の取得は Processor 側の責任です。毎分数十件流れるため、ここで直列取得するとタイムアウトします。

### JSON 生成（`src/lib/json-builder.js`）

Atom フィードを解析して JSON に変換：

- タイムスタンプ（UTC）
- フィードごとのエントリ一覧
- 統計情報（全フィード数、新着エントリ数）

### 重複排除（`src/lib/dedup.js`）

entry の `id`（電文XMLのURL）を SHA-1 でハッシュし、過去に処理したかを判定。

## GitHub Actions

### `poll-jma.yml`

```
毎5分実行 (*/5 * * * *)
1. ノード環境セットアップ
2. npm install
3. node scripts/github-poll.js でデータ取得
4. api/latest.json を commit & push
```

手動実行も可能（`workflow_dispatch`）。

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
