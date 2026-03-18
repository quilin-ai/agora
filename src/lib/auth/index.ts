import NextAuth from 'next-auth';

import { authConfig } from './config';
import { createOrUpdateUser } from './user-sync';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (!user.email) return false;
      try {
        const dbUser = await createOrUpdateUser({
          email: user.email,
          name: user.name ?? undefined,
          avatarUrl: user.image ?? undefined,
          authProvider: account?.provider ?? 'google',
          authId: account?.providerAccountId ?? undefined,
        });
        user.id = dbUser.id;
        return true;
      } catch {
        return false;
      }
    },
  },
});
