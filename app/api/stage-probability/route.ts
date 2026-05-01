/**
 * Issue #64 — フェーズ確度マスタ API
 *
 * GET  /api/stage-probability
 *   全フェーズの確度を返す（マスタに登録されたものだけ。マンスリー転貸 11 フェーズ想定）。
 *
 * PUT  /api/stage-probability
 *   { stageName, probability }  確度のみ更新可能。
 *   グループは固定（マイグレーションで管理）。
 *
 * dashboard.stage_probability のスキーマは docs/migrations/2026-05-01-stage_probability.sql 参照。
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bq, query } from '@/lib/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const STAGE_PROB_TABLE = `\`${PROJECT_ID}.dashboard.stage_probability\``;
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

type RawRow = {
  stage_name: string;
  stage_group: string;
  probability: number | string;
  sort_order: number | null;
};

export async function GET() {
  try {
    const rows = await query<RawRow>(
      `SELECT stage_name, stage_group, probability, sort_order
       FROM ${STAGE_PROB_TABLE}
       ORDER BY sort_order, stage_name`,
    );
    return NextResponse.json({
      rows: rows.map((r) => ({
        stageName: r.stage_name,
        stageGroup: r.stage_group,
        probability: Number(r.probability),
        sortOrder: r.sort_order,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Not found') || message.includes('does not exist')) {
      return NextResponse.json({ rows: [], warning: 'stage_probability が未作成です' });
    }
    console.error('確度マスタ取得エラー:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const stageName = typeof body.stageName === 'string' ? body.stageName : null;
  if (!stageName) {
    return NextResponse.json({ error: 'stageName is required' }, { status: 400 });
  }
  const probability = Number(body.probability);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    return NextResponse.json(
      { error: 'probability must be a number between 0 and 1' },
      { status: 400 },
    );
  }

  // グループ追加・削除はコード/マイグレーションで管理する想定なので
  // この API は probability のみ更新する（UPDATE 専用、INSERT しない）。
  const sql = `
    UPDATE ${STAGE_PROB_TABLE}
    SET
      probability = CAST(@probability AS NUMERIC),
      updated_at = CURRENT_TIMESTAMP(),
      updated_by = @updatedBy
    WHERE stage_name = @stageName
  `;

  try {
    const [job] = await bq.createQueryJob({
      query: sql,
      location: LOCATION,
      params: { stageName, probability, updatedBy: email },
      types: { stageName: 'STRING', probability: 'NUMERIC', updatedBy: 'STRING' },
    });
    await job.getQueryResults();
    const numRowsAffected = Number(job.metadata?.statistics?.query?.numDmlAffectedRows ?? 0);
    if (numRowsAffected === 0) {
      return NextResponse.json(
        { error: `stageName not found: ${stageName}` },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('確度マスタ更新エラー:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
