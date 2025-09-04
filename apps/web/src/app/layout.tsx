import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "../index.css";
import "reactflow/dist/style.css";
import "../styles/reactflow-override.css";
import Providers from "@/components/providers";
import { AppLayout } from "@/components/app-layout";

const nunito = Nunito({ 
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
	title: "OpenChat",
	description: "AI-powered chat application",
	manifest: "/manifest.json",
	appleWebApp: {
		capable: true,
		statusBarStyle: "default",
		title: "OpenChat",
	},
	icons: {
		icon: "/favicon.ico",
	},
};

export const viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	themeColor: "#6231ce",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					dangerouslySetInnerHTML={{
						__html: `
							if ('serviceWorker' in navigator) {
								window.addEventListener('load', function() {
									navigator.serviceWorker.register('/sw.js');
								});
							}
						`,
					}}
				/>
			</head>
			<body className={`${nunito.className} min-h-screen bg-background antialiased`}>
				<Providers>
					<AppLayout>{children}</AppLayout>
				</Providers>
			</body>
		</html>
	);
}
