# Salesforce フィールドマッピング

ad-manager では BigQuery `stellarforce-bi.staging` にミラーされた Salesforce データを参照しています。SF オブジェクトのフィールドはカスタム項目（`*__c`）が多く、`Field*__c` のような数字付きの項目は名前から用途が読めないため、正準対訳をここに残します。

更新時は `Allobj.sql`（受領済みのマスター SQL）と本ドキュメントを必ず同期させてください。

## テーブル階層

```
sf_Lead (l) ─ ConvertedOpportunityId ─▶ sf_Opportunity (lead_opp)
                                              │
                                              └ opportunity__c ◀ sf_contract_management__c (con)
                                                                          │
                                                                          ├ account__c    ▶ sf_Account (借主 debtor_acc)
                                                                          └ creditor__c   ▶ sf_Account (貸主 creditor_acc)
```

リード → コンバート → 案件 → 契約管理 → 取引先（借主・貸主）という流れです。

## sf_Lead

| フィールド | 業務名 | 備考 |
|---|---|---|
| `Id` | リードID | |
| `Name` | 名前 | |
| `Field9__c` | **受付日時** | ⚠️ `CreatedDate` ではなくこちらが正準 |
| `Status` | リードステータス | |
| `Company` | 会社名 | |
| `lost_order_reason__c` | 失注理由 | |
| `ryuunyuumoto__c` | 流入元（LP反響） | |
| `TrafficSourceMedia__c` | 流入元（媒体別） | ad_manager の Platform へのマッピング元 |
| `Media__c` | メディア | |
| `Campaign__c` | キャンペーン | |
| `SearchWords__c` | 検索ワード | |
| `AdContents__c` | 広告コンテンツ | |
| `Field15__c` | アプローチ日時 | |
| `Field16__c` | アプローチタイム（分） | |
| `Field11__c` | リードタイム | |
| `other__c` | その他メモ | |
| `Website` | Webサイト | |
| `Stock_Classification__c` | 上場分類 | |
| `Industry__c` | 業種 | |
| `Domestic_Locations__c` | 国内拠点数 | |
| `Established__c` | 設立 | |
| `Fiscal_Month__c` | 決算月 | |
| `capital__c` | 資本金 | |
| `Employee__c` | 従業員数 | |
| `busyo__c` | 部署 | |
| `Phone` | 電話 | |
| `yakusyoku__c` | 役職 | |
| `Email` | メール | |
| `keiyakukeitai__c` | 契約形態 | |
| `Field17__c` | 希望の宿泊施設 | |
| `need_number_of_room__c` | 必要戸数（数値） | |
| `arealp__c` | 都道府県（LP反響用） | |
| `Field5__c` | 利用期間（始期） | |
| `Field6__c` | 利用期間（終期） | |
| `Field8__c` | 利用期間（日数） | |
| `mokutekichi__c` | 目的地（住所等） | |
| `riyoumokutekilp__c` | 利用目的（LP反響用） | |
| `sonotagoyoubou__c` | その他ご要望（LP反響用） | |
| `inquiry_reason__c` | お問い合わせ理由 | |
| `PrivacyPolicyAgreement__c` | プライバシーポリシーの同意 | |
| `ConvertedOpportunityId` | コンバート先案件ID | sf_Opportunity への JOIN キー |
| `ConvertedAccountId` | コンバート先取引先ID | |
| `ConvertedContactId` | コンバート先担当者ID | |
| `IsConverted` | コンバートフラグ | |

## sf_Opportunity

| フィールド | 業務名 | 備考 |
|---|---|---|
| `Id` | 案件ID | |
| `Name` | 案件名 | |
| `AccountId` | 取引先ID | |
| `management_no__c` | 管理番号 | |
| `contract_responsible__c` | 事務担当 | |
| `decision_expected_date__c` | 決定予定日 | |
| `tenant_monthly__c` | 入居者名（マンスリー） | |
| `accuracy__c` | 確度 | |
| `StageName` | 案件フェーズ | `sf_OpportunityStage.MasterLabel` と JOIN |
| `oya__c` | 紹介元（デフォルト） | |
| `iraimoto__c` | 紹介元 | |
| `Reception_date__c` | 受付日 | ⚠️ Lead 側の `Field9__c` 相当 |
| `CloseDate` | 入居予定日 | |
| `leave_expected_date__c` | 退去予定日 | |
| `Field38__c` | 窓口担当者 | |
| `elapsed_lead_time__c` | 経過リードタイム | |
| `use_days_order__c` | 利用日数（依頼） | |
| `days_up_to_reception_contract_start__c` | 受付から契約開始までの日数 | |
| `target_area__c` | 目的地（エリア） | |
| `allcount_contract_room__c` | 合計成約室数 | |
| `area1__c` | 都道府県 | |
| `inquiry_reason__c` | お問い合わせ理由 | |
| `target_area_detai_address__c` | 目的地詳細住所 | |
| `ryuunyuumoto_LP__c` | 流入元（LP） | |
| `ryuunyuumoto_search_engine__c` | 流入元（検索エンジン） | |
| `purpose_detail__c` | 利用目的詳細 | |
| `request_number_of_room__c` | 希望室数 | |
| `requested_rent_from_customer__c` | 企業からの希望賃料 | |
| `requested_rent_to_partner__c` | 業者への希望賃料 | |
| `proposal_detail__c` | 提案内容 | |
| `hearingmemo__c` | メモ | |
| `PaymentTiming__c` | 支払タイミング | |
| `MaxContractPlanAmount__c` | 最大契約予定金額 | |
| `is_estimate_check__c` | 見積承認フラグ | |

## sf_contract_management__c（契約管理）

ダッシュボード未連携。**今後の可視化候補が集中**しています。

| フィールド | 業務名 | 備考 |
|---|---|---|
| `Id` | 契約管理ID | |
| `Name` | 契約管理名 | |
| `monthly_management_number__c` | 管理番号（契約） | |
| `ldk_staff__c` | 営業担当者 | |
| `account__c` | 取引先ID（借主） | sf_Account への JOIN キー |
| `opportunity__c` | 案件ID | sf_Opportunity への JOIN キー |
| `parent_trading_target__c` | 紹介元（デフォルト） | |
| `agent__c` | 紹介元 | |
| `account_contract_holder_monthly__c` | 契約名義（マンスリー） | |
| `use_days_order__c` | 利用日数（依頼） | |
| `target_area_detai_address__c` | 目的地詳細住所 | |
| `purpose_detail__c` | 利用目的詳細 | |
| `contact_person__c` | 窓口担当者 | |
| `proposal_detail__c` | 提案内容 | |
| `request_number_of_room__c` | 希望室数 | |
| `hearingmemo__c` | メモ | |
| `estate_name_in_ldk__c` | 物件名称B | |
| `estate_name_a_in_ldk__c` | 物件名称A | |
| `room_no__c` | 号室 | |
| `creditor__c` | 貸主ID | sf_Account への JOIN キー |
| `DeterminingPropertyURL__c` | 決定物件URL | |
| `management_company_rep_person__c` | 管理会社担当者 | |
| `property__c` | 物件名称 | |
| `structure__c` | 構造 | |
| `address_prefectures_with_entry__c` | 住所（都道府県から入力） | |
| `square_meters__c` | 平米数 | |
| `is_contracted_monthly_inhouse__c` | 自社物件で決まった場合チェック | |
| `is_refarral__c` | 紹介案件 | |
| `contract_start_date__c` | 契約開始日 | |
| `end_date__c` | 契約終了日 | |
| `MoveInTime__c` | 入居時間 | |
| `ExpulsionTime__c` | 退去時間 | |
| `decision_date__c` | 決定日（粗利益計上日） | |
| `contracted_detail__c` | 成約内容 | |
| `parking_contract__c` | 駐車場契約 | |
| `contracted_number_of_room__c` | 成約室数 | |
| `security_deposit_deposit__c` | 敷金・保証金 | |
| `use_days_contracted__c` | 利用日数（成約） | |
| `billed_amount_to_tenant__c` | 借主への請求額 | |
| `billed_amount_from_partner__c` | 業者からの請求額 | |
| `refund_date__c` | 敷金・保証金返金日 | |
| `referral_fee_from_partner__c` | 紹介料（業者から） | |
| `referral_fee_to_referrer__c` | 紹介料（紹介元へ） | |
| `payment_date_from_partner__c` | 紹介料入金日 | |
| `payment_date_to_referrer__c` | 紹介料出金日 | |
| `total_sales_gross_profit__c` | 総売上・粗利 | |
| `gross_profit_rate__c` | 粗利率 | |
| `is_checked_referral_fee_by_accounting__c` | 紹介料・経理チェック | |
| `amount_classification__c` | 請求区分 | |
| `handover_to_accounting_dept__c` | 経理への引き継ぎ事項 | |
| `handover_in_conclusion__c` | 締結時の引き継ぎ事項 | |

## sf_Account

借主・貸主の両方をこの 1 テーブルで持ちます。`sf_contract_management__c.account__c`（借主）と `sf_contract_management__c.creditor__c`（貸主）から JOIN します。

| フィールド | 業務名 |
|---|---|
| `Id` | 取引先ID |
| `Name` | 取引先名 |

## ステージ名

`sf_OpportunityStage.MasterLabel` と `sf_Opportunity.StageName` で結合して使います。`lib/salesforce/queries.ts` の `SF_STAGE_WON` / `SF_STAGES_LOST` に値を保持しています。

## 期間フィルタの基準日

ダッシュボードでは「いつ受け付けたか」で集計するため、以下を正準とします。

- リード集計: `sf_Lead.Field9__c`（受付日時）— NULL（約 5%）は `CreatedDate` でフォールバック
- 案件集計: `sf_Opportunity.Reception_date__c`（受付日） — ⚠️ 現状は `CreatedDate` で集計しているため要再検討
- ステージ遷移ベース集計（Won/Lost のトレンド等）: `LastStageChangeDate`

## ステージ名の実データ分布（2026-04-28 時点）

`SELECT StageName, COUNT(*) FROM sf_Opportunity GROUP BY StageName` の結果。`lib/salesforce/queries.ts` の `SF_STAGES_LOST` はこれを元にメンテナンスする。

| 分類 | StageName | 件数 |
|---|---|---:|
| Won | 案件成立 | 22,483 |
| Lost | 失注（案内できなかった） | 11,873 |
| Lost | 失注（連絡が取れなかった） | 8,664 |
| Lost | 失注 | 5,321 |
| Lost | 依頼キャンセル | 4,137 |
| Lost | 失注（案内したが負けた） | 2,183 |
| Lost | 失注（他決） | 1,323 |
| Lost | キャンセル | 1,015 |
| Lost | 失注（理由不明） | 655 |
| Lost | 失注（他決 / ウィークリー） | 50 |
| Lost | 失注（対応不備・トラブル） | 2 |
| Open | 物件決定 | 1,434 |
| Open | 契約処理中 | 1,251 |
| Open | ドラフト送付 | 382 |
| Open | 物件紹介済 | 268 |
| Open | 事務手続き完了 | 231 |
| Open | 新規受託 | 84 |
| Open | 締結中 | 69 |
| Open | ヒアリング | 64 |
| Open | 書類原本成立 | 27 |
| Open | 現地案内 | 10 |
| Open | 承認済 | 6 |
| Open | ドラフト承認申請 | 6 |
| Open | 仲介店差配 | 5 |
| Open | 資料企業確認 | 2 |

⚠️ コード上に残っている `'失注（キャンセル）'` は実データに 0 件（無効値）。害は無いので保守的に残置。
