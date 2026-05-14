'use client';

/**
 * ダッシュボード（サマリービュー）
 *
 * 毎朝開いて「直近の動き」「進捗の達成感」「新規成約/依頼」を一望するための
 * トップページ。詳細な分析は /dashboard/ad-detail などのリンク先で見る。
 */

import { ProgressView } from '@/components/dashboard/progress-view';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { LeadActivityFeed } from '@/components/dashboard/lead-activity-feed';
import { SearchKeywordsSection } from '@/components/dashboard/search-keywords-section';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          直近の動きと進捗のサマリー。詳細は左メニューの「広告詳細」「入居日ベース」「CV発生日ベース」などから。
        </p>
      </div>

      {/* 進捗ビュー（期間タブ切替: 今週 / 今月 / Q / 半期 / 年次） */}
      <ProgressView />

      {/* 直近 7 日のフィード（新規成約 / 新規依頼を左右 2 カラム） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityFeed />
        <LeadActivityFeed />
      </div>

      {/* 検索キーワード（媒体タブ切替 / CV あり + 新規 2 カラム） */}
      <SearchKeywordsSection />
    </div>
  );
}
