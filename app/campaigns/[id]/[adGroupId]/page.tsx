'use client';

import { use } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InfoIcon, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getCampaign,
  getAdGroup,
  getAdsByAdGroup,
  getKeywordsByAdGroup,
  type AdData,
  type KeywordData,
} from '@/lib/campaign-mock-data';

// ─── フォーマット ────────────────────────────────────────────────

const PLATFORM_CONFIG = {
  google: { label: 'Google',  className: 'bg-blue-100 text-blue-700' },
  yahoo:  { label: 'Yahoo!',  className: 'bg-red-100 text-red-700' },
  bing:   { label: 'Bing',    className: 'bg-teal-100 text-teal-700' },
} as const;

const fmtInt = new Intl.NumberFormat('ja-JP');
const fmtJpy = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('ja-JP', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function qsColor(score: number): string {
  if (score >= 7) return 'text-green-600';
  if (score >= 4) return 'text-yellow-600';
  return 'text-red-500';
}

function matchTypeBadge(matchType: string): { label: string; className: string } {
  switch (matchType) {
    case 'フレーズ一致':     return { label: 'フレーズ', className: 'bg-purple-100 text-purple-700' };
    case 'インテントマッチ': return { label: 'インテント', className: 'bg-blue-100 text-blue-700' };
    case '完全一致':         return { label: '完全', className: 'bg-green-100 text-green-700' };
    default:                 return { label: matchType, className: 'bg-gray-100 text-gray-700' };
  }
}

// ─── 広告テーブル（検索RSA） ─────────────────────────────────────

function SearchAdsTable({ ads }: { ads: AdData[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6 pl-4" />
              <TableHead className="min-w-48">広告見出し</TableHead>
              <TableHead className="min-w-56">説明文</TableHead>
              <TableHead>広告種類</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right pr-4">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.map((ad) => (
              <TableRow key={ad.id} className="text-sm">
                <TableCell className="pl-4">
                  <span
                    className={cn('inline-block h-2 w-2 rounded-full', ad.status === 'active' ? 'bg-green-500' : 'bg-gray-400')}
                    aria-label={`ステータス: ${ad.status === 'active' ? '有効' : '一時停止'}`}
                  />
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    {ad.headlines.slice(0, 3).map((h, i) => (
                      <div key={i} className={cn('text-sm', i === 0 ? 'font-medium text-blue-700' : 'text-muted-foreground')}>
                        {h}
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
                    {ad.descriptions[0]}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{ad.adFormat}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtInt.format(ad.impressions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtInt.format(ad.clicks) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtPct.format(ad.ctr) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.cost > 0 ? fmtJpy.format(ad.cost) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtJpy.format(ad.cpc) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.conversions > 0 ? fmtInt.format(ad.conversions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums pr-4">{ad.cpa != null ? fmtJpy.format(ad.cpa) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── クリエイティブ一覧（ディスプレイ） ──────────────────────────

function CreativeGallery({ ads }: { ads: AdData[] }) {
  const displayAds = ads.filter((ad) => ad.imageFileName);
  if (displayAds.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">クリエイティブデータがありません</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayAds.map((ad) => (
        <Card key={ad.id} className="overflow-hidden">
          <div className="aspect-square bg-muted flex items-center justify-center border-b">
            <div className="text-center p-4">
              <ImageIcon className="size-10 text-muted-foreground/40 mx-auto mb-2" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{ad.imageFileName}</p>
              {ad.imageSize && <p className="text-xs text-muted-foreground/60">{ad.imageSize}</p>}
            </div>
          </div>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium truncate" title={ad.name}>{ad.name}</p>
              <span className={cn(
                'inline-block h-2 w-2 rounded-full shrink-0 ml-2',
                ad.status === 'active' ? 'bg-green-500' : 'bg-gray-400',
              )} aria-label={`ステータス: ${ad.status === 'active' ? '有効' : '一時停止'}`} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">表示回数</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.impressions)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">クリック</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.clicks)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CTR</p>
                <p className="text-sm font-medium tabular-nums">{fmtPct.format(ad.ctr)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">費用</p>
                <p className="text-sm font-medium tabular-nums">{fmtJpy.format(ad.cost)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPC</p>
                <p className="text-sm font-medium tabular-nums">{fmtJpy.format(ad.cpc)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CV</p>
                <p className="text-sm font-medium tabular-nums">{fmtInt.format(ad.conversions)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── ディスプレイ広告テーブル ─────────────────────────────────────

function DisplayAdsTable({ ads }: { ads: AdData[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6 pl-4" />
              <TableHead className="min-w-40">広告名</TableHead>
              <TableHead>広告種類</TableHead>
              <TableHead>画像サイズ</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right pr-4">CPA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ads.map((ad) => (
              <TableRow key={ad.id} className="text-sm">
                <TableCell className="pl-4">
                  <span
                    className={cn('inline-block h-2 w-2 rounded-full', ad.status === 'active' ? 'bg-green-500' : 'bg-gray-400')}
                    aria-label={`ステータス: ${ad.status === 'active' ? '有効' : '一時停止'}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="truncate max-w-xs" title={ad.name}>{ad.name}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{ad.adFormat}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{ad.imageSize ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtInt.format(ad.impressions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtInt.format(ad.clicks) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.impressions > 0 ? fmtPct.format(ad.ctr) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.cost > 0 ? fmtJpy.format(ad.cost) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.clicks > 0 ? fmtJpy.format(ad.cpc) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{ad.conversions > 0 ? fmtInt.format(ad.conversions) : '—'}</TableCell>
                <TableCell className="text-right tabular-nums pr-4">{ad.cpa != null ? fmtJpy.format(ad.cpa) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── キーワードテーブル ──────────────────────────────────────────

function KeywordsTable({ keywords }: { keywords: KeywordData[] }) {
  if (keywords.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">キーワードデータがありません</p>;
  }

  // 費用の降順でソート
  const sorted = [...keywords].sort((a, b) => b.cost - a.cost);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-6 pl-4" />
              <TableHead className="min-w-40">キーワード</TableHead>
              <TableHead>マッチタイプ</TableHead>
              <TableHead className="text-right">品質スコア</TableHead>
              <TableHead className="text-right">表示回数</TableHead>
              <TableHead className="text-right">クリック</TableHead>
              <TableHead className="text-right">CTR</TableHead>
              <TableHead className="text-right">費用</TableHead>
              <TableHead className="text-right">CPC</TableHead>
              <TableHead className="text-right">CV</TableHead>
              <TableHead className="text-right">CVR</TableHead>
              <TableHead className="text-right">CPA</TableHead>
              <TableHead className="text-right pr-4">IS(上部)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((kw) => {
              const mt = matchTypeBadge(kw.matchType);
              return (
                <TableRow key={kw.id} className="text-sm">
                  <TableCell className="pl-4">
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        kw.status === 'active' ? 'bg-green-500' : kw.status === 'limited' ? 'bg-yellow-400' : 'bg-gray-400',
                      )}
                      aria-label={`ステータス: ${kw.status}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{kw.keyword}</TableCell>
                  <TableCell>
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', mt.className)}>
                      {mt.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {kw.qualityScore != null ? (
                      <span className={qsColor(kw.qualityScore)}>{kw.qualityScore}/10</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{kw.impressions > 0 ? fmtInt.format(kw.impressions) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtInt.format(kw.clicks) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.impressions > 0 ? fmtPct.format(kw.ctr) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.cost > 0 ? fmtJpy.format(kw.cost) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtJpy.format(kw.cpc) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.conversions > 0 ? fmtInt.format(kw.conversions) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.clicks > 0 ? fmtPct.format(kw.cvr) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{kw.cpa != null ? fmtJpy.format(kw.cpa) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums pr-4 text-xs">{kw.topImprRate ?? '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── ページ ──────────────────────────────────────────────────────

export default function AdGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string; adGroupId: string }>;
}) {
  const { id, adGroupId } = use(params);
  const campaign = getCampaign(id);
  const adGroup = getAdGroup(adGroupId);
  const ads = getAdsByAdGroup(adGroupId);
  const keywords = getKeywordsByAdGroup(adGroupId);

  if (!campaign || !adGroup) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-muted-foreground">広告グループが見つかりません</div>
      </MainLayout>
    );
  }

  const isSearch = campaign.adType === 'search';
  const isDisplay = campaign.adType === 'display';
  const platformCfg = PLATFORM_CONFIG[campaign.platform];

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* パンくず */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/campaigns" />}>
                キャンペーン
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`/campaigns/${id}`} />}>
                {campaign.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{adGroup.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* ヘッダー */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{adGroup.name}</h1>
            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', platformCfg.className)}>
              {platformCfg.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {campaign.name} — {adGroup.type} — 2026年3月
          </p>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: '表示回数', value: fmtInt.format(adGroup.impressions) },
            { label: 'クリック', value: fmtInt.format(adGroup.clicks) },
            { label: 'CTR', value: fmtPct.format(adGroup.ctr) },
            { label: '費用', value: fmtJpy.format(adGroup.cost) },
            { label: 'CPC', value: fmtJpy.format(adGroup.cpc) },
            { label: 'CV', value: fmtInt.format(adGroup.conversions) },
            { label: 'CPA', value: adGroup.cpa != null ? fmtJpy.format(adGroup.cpa) : '—' },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-semibold tabular-nums mt-0.5">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* サンプルデータバナー */}
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>サンプルデータを表示しています。</span>
        </div>

        {/* タブ */}
        <Tabs defaultValue={0}>
          <TabsList variant="line">
            <TabsTrigger value={0}>
              広告 ({ads.length})
            </TabsTrigger>
            {isSearch && (
              <TabsTrigger value={1}>
                キーワード ({keywords.length})
              </TabsTrigger>
            )}
            {isDisplay && (
              <TabsTrigger value={1}>
                クリエイティブ一覧
              </TabsTrigger>
            )}
          </TabsList>

          {/* 広告タブ */}
          <TabsContent value={0}>
            {ads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">広告データがありません</p>
            ) : isSearch ? (
              <SearchAdsTable ads={ads} />
            ) : (
              <DisplayAdsTable ads={ads} />
            )}
          </TabsContent>

          {/* キーワードタブ（検索のみ） */}
          {isSearch && (
            <TabsContent value={1}>
              <KeywordsTable keywords={keywords} />
            </TabsContent>
          )}

          {/* クリエイティブ一覧タブ（ディスプレイのみ） */}
          {isDisplay && (
            <TabsContent value={1}>
              <CreativeGallery ads={ads} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
