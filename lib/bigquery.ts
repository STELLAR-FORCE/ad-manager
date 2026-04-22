import { BigQuery } from '@google-cloud/bigquery';
import { IdentityPoolClient } from 'google-auth-library';
import { headers } from 'next/headers';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'stellarforce-bi';
const DATASET = process.env.BQ_DATASET ?? 'ad_manager';
const LOCATION = process.env.BQ_LOCATION ?? 'asia-northeast1';

const globalForBq = globalThis as unknown as { bq: BigQuery | undefined };

function createClient(): BigQuery {
  const wifAudience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  const wifServiceAccount = process.env.GCP_SERVICE_ACCOUNT;
  if (wifAudience && wifServiceAccount) {
    const authClient = new IdentityPoolClient({
      audience: wifAudience,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      token_url: 'https://sts.googleapis.com/v1/token',
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${wifServiceAccount}:generateAccessToken`,
      subject_token_supplier: {
        getSubjectToken: async () => {
          // Vercel Functions では OIDC トークンは x-vercel-oidc-token ヘッダーで渡される。
          // ローカル開発 (vercel env pull 済み) では VERCEL_OIDC_TOKEN 環境変数で上書き可。
          const envToken = process.env.VERCEL_OIDC_TOKEN;
          if (envToken) return envToken;
          try {
            const headerList = await headers();
            const token = headerList.get('x-vercel-oidc-token');
            if (token) return token;
          } catch {
            // headers() がリクエスト外 (ビルド時など) で呼ばれたケース
          }
          throw new Error('OIDC token not available: neither VERCEL_OIDC_TOKEN env nor x-vercel-oidc-token header was found');
        },
      },
    });
    return new BigQuery({ projectId: PROJECT_ID, authClient });
  }

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
