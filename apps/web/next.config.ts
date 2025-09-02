import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	experimental: {
		optimizeCss: true,
		optimizePackageImports: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-avatar', 'lucide-react', 'framer-motion'],
	},
	webpack: (config, { isServer }) => {
		// Optimize bundle splitting
		if (!isServer) {
			config.optimization.splitChunks = {
				...config.optimization.splitChunks,
				chunks: 'all',
				cacheGroups: {
					vendor: {
						test: /[\\/]node_modules[\\/]/,
						name: 'vendors',
						chunks: 'all',
						priority: 10,
					},
					radix: {
						test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
						name: 'radix',
						chunks: 'all',
						priority: 20,
					},
					framer: {
						test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
						name: 'framer',
						chunks: 'all',
						priority: 15,
					}
				}
			};
		}
		return config;
	}
};

export default nextConfig;
