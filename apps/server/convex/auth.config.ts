import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [
    Password({
      id: "password",
      profile(params) {
        const email = params.email as string;
        return {
          email: email,
          name: email.split('@')[0],
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      return redirectTo ?? "/";
    },
  },
});