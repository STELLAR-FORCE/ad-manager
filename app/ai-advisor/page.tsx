'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SparklesIcon, InfoIcon, SendIcon, AlertTriangleIcon, TrendingUpIcon, SearchIcon, DollarSignIcon, BarChart2Icon } from 'lucide-react'

interface Insight {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  action: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const PRIORITY_CONFIG: Record<string, { label: string; variant: 'destructive' | 'warning' | 'outline' }> = {
  high: { label: '高', variant: 'destructive' },
  medium: { label: '中', variant: 'warning' },
  low: { label: '低', variant: 'outline' },
}

const CATEGORY_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  'コスト最適化': DollarSignIcon,
  'CVR改善': TrendingUpIcon,
  '予算配分': BarChart2Icon,
  'キーワード最適化': SearchIcon,
  'データ品質': InfoIcon,
}

const fmt = (n: number) =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(n)
const fmtNum = (n: number) =>
  new Intl.NumberFormat('ja-JP').format(n)

interface DashboardSummary {
  totalCampaigns: number
  activeCampaigns: number
  totalCost7d: number
  totalConversions7d: number
  totalClicks7d: number
  totalImpressions7d: number
}

export default function AiAdvisorPage() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true)
      try {
        const [insRes] = await Promise.all([
          fetch('/api/ai-advisor/insights'),
        ])
        const insData = await insRes.json()
        setInsights(Array.isArray(insData) ? insData : [])
      } catch {
        toast.error('インサイトの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const content = chatInput.trim()
    if (!content) return
    setMessages((m) => [...m, { role: 'user', content }])
    setChatInput('')
    toast.error('Claude API未連携のため、現在使用できません')
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: '申し訳ありません。Claude APIが未連携のため、AIとの会話機能は現在ご利用いただけません。設定画面でAPIキーを設定してください。',
        },
      ])
    }, 500)
  }

  const insightsByPriority = {
    high: insights.filter((i) => i.priority === 'high'),
    medium: insights.filter((i) => i.priority === 'medium'),
    low: insights.filter((i) => i.priority === 'low'),
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <SparklesIcon className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AIアドバイザー</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">データに基づいた広告改善の提案を確認します</p>
          </div>
        </div>

        {/* Claude API banner */}
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800/50 dark:bg-blue-900/20 dark:text-blue-300">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Claude APIとの連携で実際のAI分析が利用できます</p>
            <p className="mt-0.5 text-xs opacity-80">現在はルールベースの静的インサイトを表示しています。Claude APIキーを設定することで、リアルタイムのAI分析とチャット機能が有効になります。</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Insights (2/3 width) */}
          <div className="space-y-4 lg:col-span-2">
            <h2 className="text-base font-semibold">改善インサイト</h2>

            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <Skeleton className="mb-2 h-5 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="mt-1 h-4 w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : insights.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                <SparklesIcon className="size-10 opacity-30" aria-hidden="true" />
                <p className="text-sm">インサイトがありません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(['high', 'medium', 'low'] as const).flatMap((p) =>
                  insightsByPriority[p].map((insight) => {
                    const CategoryIcon = CATEGORY_ICONS[insight.category] ?? AlertTriangleIcon
                    const priorityCfg = PRIORITY_CONFIG[insight.priority]
                    return (
                      <Card key={insight.id} className={insight.priority === 'high' ? 'border-destructive/30' : ''}>
                        <CardHeader className="pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={priorityCfg.variant} className="text-xs">
                              優先度: {priorityCfg.label}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CategoryIcon className="size-3" aria-hidden="true" />
                              {insight.category}
                            </div>
                          </div>
                          <CardTitle className="text-sm">{insight.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pb-4">
                          <p className="text-sm text-muted-foreground">{insight.description}</p>
                          <div className="rounded-md bg-muted/60 px-3 py-2">
                            <p className="text-xs font-medium text-foreground">推奨アクション</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">{insight.action}</p>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Sidebar: summary + chat */}
          <div className="space-y-4">
            {/* Data summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">直近7日のサマリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="space-y-2">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">インサイト数</span>
                      <span className="tabular-nums font-medium">{fmtNum(insights.length)}件</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">優先度：高</span>
                      <span className="tabular-nums font-medium text-destructive">
                        {fmtNum(insightsByPriority.high.length)}件
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">優先度：中</span>
                      <span className="tabular-nums font-medium text-amber-600">
                        {fmtNum(insightsByPriority.medium.length)}件
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">優先度：低</span>
                      <span className="tabular-nums font-medium">{fmtNum(insightsByPriority.low.length)}件</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Chat */}
            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <SparklesIcon className="size-4" aria-hidden="true" />
                  AIに相談する
                </CardTitle>
                <CardDescription className="text-xs">
                  Claude API連携後に使用可能になります
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pb-4">
                {/* Message area */}
                <div className="h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
                  {messages.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      質問を入力してください
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {messages.map((m, i) => (
                        <div
                          key={i}
                          className={`rounded-md px-2.5 py-1.5 text-xs ${
                            m.role === 'user'
                              ? 'ml-4 bg-primary text-primary-foreground'
                              : 'mr-4 bg-background'
                          }`}
                        >
                          {m.content}
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                    placeholder="例: CTRを改善するには？"
                    className="flex-1 text-sm"
                    aria-label="AIへの質問を入力"
                  />
                  <Button
                    size="icon"
                    onClick={sendMessage}
                    disabled={!chatInput.trim()}
                    aria-label="送信"
                  >
                    <SendIcon className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
  )
}
