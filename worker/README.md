# PETBATTLE Luna・Battle Worker

画像の意味だけを `gpt-5.6-luna` で分類し、Durable Objectで2人対戦を権威的に処理するCloudflare Workerです。APIキーはブラウザへ渡しません。

## 設定とデプロイ

```powershell
npx wrangler secret put OPENAI_API_KEY --config worker/wrangler.jsonc
npx wrangler deploy --config worker/wrangler.jsonc
```

## API

### `POST /analyze`

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "sha256": "省略可能な64桁のSHA-256"
}
```

成功時は次の形を返します。

```json
{
  "sha256": "...",
  "model": "gpt-5.6-luna",
  "analysis": {
    "name": "ルナ",
    "species": "月光獣",
    "element": "light",
    "temperament": "clever",
    "traits": ["radiant", "arcane"],
    "essence": { "physical": 3, "magic": 9, "defense": 4 }
  }
}
```

- JPEG・PNG・WebP、デコード後2MiB以下だけを受け付けます。
- essenceは常に合計16へ正規化されます。ファイル容量・解像度・APIトークン数で強くなりません。
- Worker自身が画像バイト列のSHA-256を計算します。クライアント値は照合用です。
- 同一SHA-256・モデル・schema versionをCloudflare Cache APIのキーにするため、同一画像の再解析を抑制できます。
- `OPENAI_API_KEY` がない場合やAPI障害時は502/503を返します。クライアントは `analyzeImageFile` の決定論的fallbackをそのまま利用できます。

### `GET /room/:roomId?playerId=:playerId`

WebSocketへUpgradeし、最大2人の通信対戦ルームへ接続します。

クライアントから送るメッセージ:

```json
{ "type": "ready", "stats": { "hp": 238, "physical": 72, "magic": 86, "defense": 94 } }
{ "type": "action", "action": "physical" }
```

Workerは2人のready後に `battleStarted` を配信します。ターン中の行動は相手へ公開せず、両者が揃った時だけ `turnResolved` と同一のstate・event列を双方へ送ります。切断時は `opponentDisconnected` とpresence更新を通知します。

## フロントエンド設定

解析と対戦で同じWorker URLを利用できます。

```dotenv
VITE_LUNA_WORKER_URL=https://petbattle-luna.example.workers.dev
VITE_BATTLE_WORKER_URL=https://petbattle-luna.example.workers.dev
```
