# Bing広告 ETL 復旧依頼サマリ(管理部 / Microsoftサポート向け)

> Issue #111 の調査結果。**そのまま管理部・Microsoftサポートに転送可能**な形でまとめています。

## 1. 困っていること(症状)

- 広告管理ダッシュボードの **Bing(Microsoft広告)の数値が 2026-05-17 以降、更新されていない**。
- 原因は、Bing広告データを自動取得しているバッチ(Cloud Run / ETL)が認証エラーで失敗しているため。
- 認証時のエラーコード: **`AADSTS650052`**
  > The app is trying to access a service 'Microsoft Advertising API Service' that your organization lacks a service principal for.
  - 訳: 「組織(テナント)に Microsoft Advertising API Service の **サービスプリンシパル(SP)が存在しない**ため、アクセスできない」

## 2. 直接の対処(本来やりたいこと)

stellarforce テナント内に、以下の **サービスプリンシパルを1つ作成**(=管理者同意)すれば直る:

- Microsoft Advertising API Service
- アプリID: `d42ffc93-c136-491d-b4fd-6f18168c68fd`
- 作成コマンド例: `az ad sp create --id d42ffc93-c136-491d-b4fd-6f18168c68fd`

この操作には **Entra ID(Azure AD)の「グローバル管理者」または「クラウドアプリケーション管理者」ロール** が必要。

## 3. 根本のブロッカー(調査で判明した事実)

**stellarforce テナントには、人間の管理者が一人も存在しない。**

| 確認項目 | 結果 |
|---|---|
| 対象テナント | **stellarforce.com**(テナントID `ce04d0d5-028e-4a56-b5f6-cb4e0129b4fc`) |
| グローバル管理者(アクティブ) | `Microsoft Office 365 Portal`(Microsoft標準のサービスプリンシパル)**のみ**。人間は0人 |
| グローバル管理者(PIM 資格あり/アクティブ/期限切れ) | **すべて空** |
| `k.nakatomi@stellarforce.com` のロール | **なし**(一般メンバー) |
| 別途付与した `nakatomi.keishi@ldkhonbu.onmicrosoft.com` | **別テナント(ldkhonbu)** のアカウントのため stellarforce には無効。ゲストとしても未登録 |

→ 人間の管理者が居ないため、**ロール付与もSP作成も通常手段では誰にもできない**。

## 4. 必要な対応(Microsoftサポート依頼)

**「管理者不在テナントの、管理者アクセス回復(admin takeover)」** を依頼する。

1. **stellarforce.com のDNS(ドメイン)を管理している人**を用意(所有証明にTXTレコード追加等を求められる)。
2. Microsoft が本人確認・ドメイン所有確認 → **人間のグローバル管理者を設定**してもらう。
3. その後の社内手順(エンジニア側で対応可能):
   - 新GAが `k.nakatomi@stellarforce.com` に「クラウドアプリケーション管理者」を付与
   - `az ad sp create --id d42ffc93-c136-491d-b4fd-6f18168c68fd` でSP作成
   - Bing のリフレッシュトークン再取得 → Secret Manager 更新
   - Cloud Run Job `ad-manager-etl` を再実行 → BQ に Bing データ復帰

窓口: Microsoft 365 管理センターのサポート、または Azure サポート。
依頼時の一言: 「**テナントに管理者が居らず、管理者アクセスを回復したい(admin takeover)**」

## 5. 事前に用意しておくと早いもの

- stellarforce.com のドメインを管理しているサービス名(お名前.com / Route53 / Cloudflare など)とログイン手段
- テナントID: `ce04d0d5-028e-4a56-b5f6-cb4e0129b4fc`
- Microsoft 365 / Azure の契約(サブスクリプション)情報があれば

## 6. 補足

- ldkhonbu(管理部)が stellarforce を **委任管理(GDAP/CSP)** で管理している場合は、その経路で stellarforce の管理者操作ができる可能性がある。先に管理部へ確認する価値あり(これがあれば Microsoftサポート不要で進む)。
- 影響範囲: ダッシュボードの Bing 数値・媒体ブレイクダウンの Bing・消化予算の Bing 部分が 5/17 以降未更新。Google / Yahoo は正常。
