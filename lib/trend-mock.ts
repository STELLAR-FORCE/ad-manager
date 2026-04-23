export type DailyMetrics = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue: number;
};

export type TotalMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionValue?: number;
};

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
}

export function generateItemTrend(
  seed: string,
  totals: TotalMetrics,
  period: { start: Date; end: Date },
): DailyMetrics[] {
  const dayCount = Math.max(
    1,
    Math.round((period.end.getTime() - period.start.getTime()) / 86_400_000) + 1,
  );
  const rng = seededRandom(seed);
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < dayCount; i++) {
    const base = 0.6 + Math.sin((i / Math.max(dayCount - 1, 1)) * Math.PI) * 0.3;
    const noise = 0.7 + rng() * 0.6;
    const w = base * noise;
    weights.push(w);
    sum += w;
  }
  return weights.map((w, i) => {
    const frac = sum > 0 ? w / sum : 0;
    const date = new Date(period.start.getTime() + i * 86_400_000);
    return {
      date: date.toISOString().split('T')[0],
      impressions: Math.round(totals.impressions * frac),
      clicks: Math.round(totals.clicks * frac),
      cost: Math.round(totals.cost * frac),
      conversions: Math.round(totals.conversions * frac),
      conversionValue: Math.round((totals.conversionValue ?? 0) * frac),
    };
  });
}
