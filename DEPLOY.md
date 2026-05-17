# GitHubへのアップロード＆Renderでの公開手順

---

## ファイル構成

```
kakushi/
├── server.js       ← Node.jsサーバー（WebSocket + 静的ファイル配信）
├── worddata.js     ← サーバー側単語DB
├── package.json    ← 依存関係
└── public/
    ├── index.html  ← ゲーム画面
    └── words.js    ← クライアント側単語DB（現在未使用だが同梱しておく）
```

---

## STEP 1 — GitHubにリポジトリを作る

1. https://github.com にログイン
2. 右上の **「+」→「New repository」** をクリック
3. 設定：
   - Repository name: `kakushi-quiz`
   - **Public** を選択
   - 「Add a README file」は**チェックしない**
4. **「Create repository」** をクリック

---

## STEP 2 — ファイルをアップロード

### ブラウザからアップロード（推奨）

1. リポジトリページで **「uploading an existing file」** をクリック
2. 以下をすべてドラッグ＆ドロップ：
   - `server.js`
   - `worddata.js`
   - `package.json`
   - `public/index.html`（※ public フォルダごとアップロード）
3. **「Commit changes」** をクリック

> **フォルダのアップロード方法：**
> ブラウザのアップロード画面ではフォルダをドラッグするとフォルダ構造ごとアップロードされます。
> または「Add file → Create new file」で `public/index.html` と入力してファイルを作ることもできます。

---

## STEP 3 — Renderで公開（**Web Service**）

⚠️ **Static Site ではなく「Web Service」を選んでください**（WebSocketサーバーが必要なため）

1. https://dashboard.render.com にログイン

2. **「+ New」→「Web Service」** をクリック

3. GitHubリポジトリ `kakushi-quiz` を選択して「Connect」

4. 設定画面で以下を入力：

   | 項目 | 値 |
   |------|----|
   | Name | `kakushi-quiz`（任意） |
   | Region | Singapore（日本から近い）|
   | Branch | `main` |
   | Runtime | **Node** |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

5. **「Create Web Service」** をクリック

6. ビルドログが流れて `Server running on port ...` が出たら完了。
   URLは `https://kakushi-quiz-xxxx.onrender.com` のような形になります。

---

## STEP 4 — 更新するとき

GitHubでファイルを編集して Commit → Render が自動で再デプロイします（1〜2分）。

---

## 注意事項

### 無料プランのスリープについて
Renderの無料プランは **15分間アクセスがないとスリープ**します。
次のアクセス時に起動まで30秒〜1分かかります。
有料プランにすると常時起動になります。

### WebSocketの接続
Socket.io はデフォルトでポーリング→WebSocketにアップグレードします。
Renderの無料プランでもWebSocketは動作します。

---

## よくある問題

| 症状 | 対処 |
|------|------|
| Build Command が空欄にできない | `npm install` と入力する |
| Start Command が空欄にできない | `npm start` と入力する |
| デプロイ後に画面が真っ白 | ログを確認。`require('./worddata')` のエラーなら worddata.js が未アップロード |
| ルームに入れない | Static Site ではなく Web Service で作成しているか確認 |
| 接続が切れる | 無料プランのスリープ。再読み込みで復帰します |
