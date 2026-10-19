# CLASS DRAW — クラス対抗トーナメント抽選

18クラス（11～16H / 21～26H / 31～36H）、合計2～30チームの公開抽選Webアプリ。同クラスのトーナメント表1回戦の対戦を禁止。2回戦以降は許可。

- ブラウザ内で計算。ログイン・サーバー・APIキー・依存パッケージ不要。
- YYYYMMDD + 日経平均株価の終値×100がシード。
- SHA-256 → ChaCha20 → 範囲棄却法 → Fisher–Yates → 配置全体の棄却。
- 設定JSONとハッシュの保存・読み込み、結果JSONの保存・再計算検証、印刷/PDF。

## 本番の手順

1. 参加数を入力し、自動発行されたIDと実際のチームの対応を確定。
2. 終値公表前に、未来の取引日・終値の出典・休場/遅延/訂正時のルールを決定。
3. 「設定JSONを保存」で出力したファイルとハッシュ、ID対応表、使用するコードのコミットを参加者へ共有。
4. 終値公表後に設定を読み込み、終値を小数第2位まで入力。確認欄をチェックして抽選。
5. 結果JSONと出典の終値を共有。他の人が結果JSONを読み込み再計算検証。

設定には終値を含めません。ハッシュは内容の一致を示すだけで、事前公開日時の証明にはなりません。終値の正しさ・事前周知・IDの対応は運営側で確認してください。日付等を例外ルールに基づき変更した場合は、変更前後の設定と根拠も共有してください。祝日は自動判定しません。株価の自動取得・配信はしません。

## GitHub Pages公開

1. GitHubに **Public** のリポジトリ（例：class-tournament）を作成。
2. 全ソースをmainブランチにpush。`.github/workflows/pages.yml`も含める。
3. **Settings → Pages → Build and deployment → Source → GitHub Actions** を選択。
4. **Actions → Test and deploy GitHub Pages → Run workflow** を実行（設定後のmainへのpushでも実行）。
5. デプロイジョブ完了後、表示されるPages URLを開く。

```bash
git init -b main
git add .
git commit -m "Implement reproducible class tournament draw"
git remote add origin https://github.com/YOUR_USERNAME/class-tournament.git
git push -u origin main
```

GitHub CLIがログイン済みなら、代わりに以下で新規作成・公開できます。

```bash
git init -b main
git add .
git commit -m "Implement reproducible class tournament draw"
gh repo create class-tournament --public --source=. --remote=origin --push
gh api --method POST repos/{owner}/class-tournament/pages -f build_type=workflow
gh workflow run pages.yml
```

Pagesが既に有効な場合、POSTを繰り返さずSettingsでSourceを確認してください。組織等のポリシーで管理者による設定が必要な場合があります。main以外を使う場合はワークフローのブランチを変更します。

公開ページのフッターにはビルド元コミットへのリンクを表示。`source-hashes.json` に主要な配信ファイルのSHA-256を出力します。

## ローカル確認

Node.js 22以上（推奨24）。依存インストール不要。

```bash
npm test
npm run build
python3 -m http.server 8000 --directory dist
```

http://localhost:8000/ を開く。HTMLのダブルクリック（file://）ではWorker・モジュール等が動作しません。公開にはHTTPSを使用してください。

## 公平性と検証

固定の空き枠以外に実チームを一様シャッフルし、同クラス対戦がある配置は丸ごと棄却。理想一様乱数では有効なラベル付き配置を均等に選ぶ方式です。実装は公開シードからのChaCha20疑似乱数であり、有限のシード集合で全組み合わせが厳密に等頻度になる保証ではありません。SHA-256は元シードのエントロピーを増やしません。日付と終値の和が同じなら乱数列も同じです。同クラス禁止の制約で不戦勝確率がクラス間で異なる場合があります。強さや優勝確率の均等は保証しません。

`npm test` はRFC既知値、Node/OpenSSLによる独立照合、範囲抽選、小規模の全シャッフル選択経路、2～30チーム、改変検出、集中構成30チーム等を検証します。試行数の打切りで別方式へ切り替える処理はありません。中断後の再実行も同じ乱数列の先頭からです。

| ファイル | 内容 |
| --- | --- |
| src/engine.js | 入力検証・ChaCha20・抽選・再検証 |
| src/worker.js | バックグラウンド処理 |
| src/app.js | UI・JSON保存・読み込み・表の表示 |
| SPEC.md | 再実装できる抽選仕様 |
| tests/engine.test.js | プロトコル検証 |
| scripts/build.mjs | 静的サイト生成 |
| .github/workflows/pages.yml | テスト成功後のPages公開 |

ライセンス：MIT。

## 試用ファイル

`examples/sample-settings.json` と `examples/sample-result.json` は読み込み・検証のためのサンプルです。終値50123.45は**架空値**で、本番の株価や結果ではありません。
