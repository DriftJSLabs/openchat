"use client";

import { ThemeProvider } from "./theme-provider";
import { OpenRouterAuthProvider } from "@/contexts/openrouter-auth";
import { ClientToaster } from "./client-toaster";
import { ConvexReactClient } from "convex/react";
import { ConvexProvider } from "convex/react";
import type { ReactNode } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function Providers({ children }: { children: ReactNode }) {
	return (
		<ConvexProvider client={convex}>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange
			>
				<OpenRouterAuthProvider>
					{children}
					<ClientToaster />
				</OpenRouterAuthProvider>
			</ThemeProvider>
		</ConvexProvider>
	);
}