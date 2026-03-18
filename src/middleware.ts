import { auth } from '@/lib/auth';

const PUBLIC_PATHS = new Set(['/', '/login', '/pricing', '/explore']);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/explore/') || pathname.startsWith('/api/auth')) {
    return;
  }
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
