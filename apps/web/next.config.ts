import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	
	// Bundle optimization
	experimental: {
		optimizePackageImports: ['@radix-ui/react-dropdown-menu', '@radix-ui/react-dialog', 'framer-motion', 'lucide-react'],
	},
	
	// Webpack configuration for better code splitting
	webpack: (config, { dev, isServer }) => {
		if (!dev && !isServer) {
			// Split vendor libraries into separate chunks
			config.optimization.splitChunks = {
				...config.optimization.splitChunks,
				cacheGroups: {
					...config.optimization.splitChunks?.cacheGroups,
					vendor: {
						test: /[\\/]node_modules[\\/]/,
						name: 'vendors',
						chunks: 'all',
						priority: 20,
					},
					radix: {
						test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
						name: 'radix',
						chunks: 'all',
						priority: 30,
					},
					framer: {
						test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
						name: 'framer-motion',
						chunks: 'all',
						priority: 30,
					},
					lucide: {
						test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
						name: 'lucide',
						chunks: 'all',
						priority: 30,
					},
				},
			};
		}
		
		return config;
	},
};

export default nextConfig;
