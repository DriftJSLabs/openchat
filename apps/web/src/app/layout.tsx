import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "../index.css";
import Providers from "@/components/providers";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const nunito = Nunito({ 
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
	title: "OpenChat",
	description: "AI-powered chat application",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${nunito.className} min-h-screen bg-background antialiased`}>
				<ErrorBoundary>
					<Providers>
						<ErrorBoundary>
							<AppLayout>
								<ErrorBoundary>
									{children}
								</ErrorBoundary>
							</AppLayout>
						</ErrorBoundary>
					</Providers>
				</ErrorBoundary>
			</body>
		</html>
	);
}
