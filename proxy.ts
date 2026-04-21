import { withAuth } from 'next-auth/middleware';

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN ?? 'stellarforce.com';

export default withAuth({
  callbacks: {
    authorized: ({ token }) =>
      token?.email?.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`) ?? false,
  },
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    // すべてのルートを保護するが、認証用ルート・静的アセット・_next は除外
    '/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
