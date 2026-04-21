import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const DATASET = process.env.BQ_DATASET ?? 'ad_manager';
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

const globalForBq = globalThis as unknown as { bq: BigQuery | undefined };

function createClient(): BigQuery {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credentialsJson) {
    const credentials = JSON.parse(credentialsJson);
    return new BigQuery({ projectId: PROJECT_ID, credentials });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

export const bq = globalForBq.bq ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForBq.bq = bq;

export function table(name: string): string {
  return `\`${PROJECT_ID}.${DATASET}.${name}\``;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const [rows] = await bq.query({ query: sql, location: LOCATION, params });
  return rows as T[];
}
