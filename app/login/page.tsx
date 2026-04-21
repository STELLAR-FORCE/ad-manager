'use client';

import { signIn } from 'next-auth/react';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');
  const callbackUrl = searchParams?.get('callbackUrl') ?? '/dashboard';

  return (
    <Card className="w-full max-w-sm shadow-lg">
      <CardHeader>
        <CardTitle className="text-center text-xl">Ad Manager</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-slate-600">
          stellarforce.com アカウントでサインインしてください。
        </p>
        {error === 'AccessDenied' && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
            このメールアドレスではアクセスできません。
          </p>
        )}
        <Button
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full"
          size="lg"
        >
          Google でサインイン
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Suspense fallback={null}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
