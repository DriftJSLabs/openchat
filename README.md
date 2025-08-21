<div align="center">

![OpenChat Banner](https://github.com/user-attachments/assets/openchat-banner-placeholder)

<img src="./openchat-logo.png" alt="OpenChat Logo" width="120" height="120">

# OpenChat

**Modern AI Chat Application with Local-First Architecture**

[![Built with Better-T-Stack](https://img.shields.io/badge/Built%20with-Better--T--Stack-blue)](https://github.com/AmanVarshney01/create-better-t-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Live Demo](#) • [Documentation](#) • [Report Bug](https://github.com/DriftJSLabs/openchat/issues) • [Request Feature](https://github.com/DriftJSLabs/openchat/issues)

</div>

---

## 🚀 About OpenChat

OpenChat is a cutting-edge AI chat application that combines the power of modern web technologies with a local-first approach. Built on the robust Better-T-Stack foundation, it delivers seamless AI conversations with offline capabilities, real-time synchronization, and a beautiful, responsive interface.

### ✨ Key Highlights

- 🤖 **AI-Powered Conversations** - Advanced AI integration for natural, intelligent chat experiences
- 🗄️ **Local-First Architecture** - Your data stays on your device with optional cloud sync
- ⚡ **Real-Time Performance** - Lightning-fast responses with optimized caching
- 🔒 **Secure Authentication** - Robust email & password authentication system
- 📱 **Responsive Design** - Beautiful UI that works seamlessly across all devices
- 🌙 **Dark/Light Mode** - Customizable themes for comfortable usage

## 🛠️ Tech Stack

### Frontend
- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety and enhanced developer experience
- **[TailwindCSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[shadcn/ui](https://ui.shadcn.com/)** - Beautiful, accessible React components
- **[Framer Motion](https://www.framer.com/motion/)** - Smooth animations and transitions

### Backend
- **[Hono](https://hono.dev/)** - Ultrafast web framework for the edge
- **[oRPC](https://orpc.dev/)** - End-to-end type-safe APIs with OpenAPI
- **[Drizzle ORM](https://orm.drizzle.team/)** - TypeScript-first ORM
- **[Better Auth](https://www.better-auth.com/)** - Comprehensive authentication solution

### Database & Infrastructure
- **[SQLite](https://www.sqlite.org/)** - Local database for offline-first experience
- **[Turso](https://turso.tech/)** - Distributed SQLite for cloud sync
- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Edge computing runtime
- **[Turborepo](https://turbo.build/)** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```
## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database:
Local development for a Cloudflare D1 database will already be running as part of the `wrangler dev` command.

2. Update your `.env` file in the `apps/server` directory with the appropriate connection details if needed.

3. Apply the schema to your database:
```bash
bun db:push
```


Then, run the development server:

```bash
bun dev
```

The API is running at [http://localhost:3000](http://localhost:3000).



## 📁 Project Structure

```
openchat/
├── 📱 apps/
│   ├── 🌐 web/              # Next.js Frontend Application
│   │   ├── src/
│   │   │   ├── app/           # App Router pages and layouts
│   │   │   ├── components/    # Reusable React components
│   │   │   │   ├── ai-elements/    # AI chat UI components
│   │   │   │   ├── onboarding/     # User onboarding flow
│   │   │   │   └── ui/             # shadcn/ui components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── lib/           # Utilities and configurations
│   │   │   │   ├── api/            # API adapters
│   │   │   │   └── db/             # Local database logic
│   │   │   └── workers/       # Web Workers for background tasks
│   │   └── public/           # Static assets and images
│   ├── 🔧 server/            # Hono Backend API
│   │   ├── src/
│   │   │   ├── db/            # Database schema and migrations
│   │   │   │   ├── migrations/     # SQL migration files
│   │   │   │   └── schema/         # Drizzle schema definitions
│   │   │   ├── lib/           # Server utilities and configs
│   │   │   └── routers/       # API route handlers
│   │   └── wrangler.jsonc    # Cloudflare Workers config
│   └── 📚 fumadocs/          # Documentation Site
│       ├── content/docs/      # Documentation content
│       └── src/              # Documentation app source
├── 📦 packages/             # Shared packages (if any)
├── 🔧 Configuration Files
│   ├── package.json          # Root package configuration
│   ├── turbo.json           # Turborepo configuration
│   ├── bts.jsonc            # Better-T-Stack configuration
│   └── CLAUDE.md            # AI assistant instructions
└── 📄 Documentation
    └── README.md            # This file
```

### Key Directories Explained

- **`apps/web/`** - The main Next.js frontend application with AI chat interface
- **`apps/server/`** - Hono-based API server with oRPC endpoints
- **`apps/fumadocs/`** - Documentation website built with Fumadocs
- **`apps/web/src/components/ai-elements/`** - Specialized UI components for AI interactions
- **`apps/web/src/lib/db/`** - Local-first database implementation with sync capabilities
- **`apps/server/src/routers/`** - Type-safe API route definitions

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `bun dev` | 🚀 Start all applications in development mode |
| `bun build` | 📦 Build all applications for production |
| `bun dev:web` | 🌐 Start only the web application (port 3001) |
| `bun dev:server` | 🔧 Start only the API server (port 3000) |
| `bun check-types` | ✅ Check TypeScript types across all apps |
| `bun db:push` | 💾 Push schema changes to database |
| `bun db:studio` | 🔍 Open Drizzle Studio database UI |
| `bun db:generate` | 📝 Generate database migrations |
| `bun db:migrate` | ⬆️ Run database migrations |
| `bun check` | 🔍 Run oxlint for code quality checks |

## 🌍 Environment Setup

### Prerequisites

- **[Bun](https://bun.sh/)** v1.2.17+ - JavaScript runtime and package manager
- **Node.js** 18+ - Alternative runtime (if not using Bun)
- **Git** - Version control

### Environment Variables

Create `.env` files in the respective app directories:

#### `apps/server/.env`
```bash
# Database
DATABASE_URL="your-database-url"
TURSO_DATABASE_URL="your-turso-url"  # For production
TURSO_AUTH_TOKEN="your-turso-token"  # For production

# Authentication
BETTER_AUTH_SECRET="your-secret-key"
BETTER_AUTH_URL="http://localhost:3000"  # Development URL

# AI Configuration (if applicable)
OPENAI_API_KEY="your-openai-key"  # Or other AI provider
```

#### `apps/web/.env.local`
```bash
# API Configuration
NEXT_PUBLIC_API_URL="http://localhost:3000"  # Development

# Authentication
BETTER_AUTH_URL="http://localhost:3000"
```

## 📺 Screenshots

<div align="center">

### 🌙 Dark Mode
![Dark Mode](https://github.com/user-attachments/assets/dark-mode-placeholder)

### ☀️ Light Mode  
![Light Mode](https://github.com/user-attachments/assets/light-mode-placeholder)

### 📱 Mobile Experience
![Mobile](https://github.com/user-attachments/assets/mobile-placeholder)

</div>

## 🎆 Features

### 🤖 AI Chat Capabilities
- **Multi-model Support** - Integration with various AI providers
- **Context Awareness** - Maintains conversation history and context
- **Rich Formatting** - Supports markdown, code syntax highlighting, and LaTeX
- **Image Analysis** - Upload and analyze images with AI
- **Code Execution** - Interactive code blocks with syntax highlighting

### 📄 Local-First Architecture
- **Offline Functionality** - Works without internet connection
- **Real-time Sync** - Seamless synchronization when online
- **Conflict Resolution** - Intelligent handling of data conflicts
- **Data Privacy** - Your conversations stay on your device

### 🎨 User Experience
- **Responsive Design** - Optimized for desktop, tablet, and mobile
- **Dark/Light Themes** - Customizable appearance
- **Accessibility** - WCAG compliant interface
- **Progressive Web App** - Install as a native app

## 🤝 Contributing

We welcome contributions from the community! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/yourusername/openchat.git`
3. **Install** dependencies: `bun install`
4. **Create** a feature branch: `git checkout -b feature/amazing-feature`
5. **Start** development server: `bun dev`
6. **Make** your changes and test thoroughly
7. **Commit** your changes: `git commit -m 'Add amazing feature'`
8. **Push** to your branch: `git push origin feature/amazing-feature`
9. **Open** a Pull Request

### Code Quality

- Run `bun check-types` to ensure TypeScript correctness
- Run `bun check` for linting with oxlint
- Follow the existing code style and conventions
- Add tests for new features when applicable

## 📜 Documentation

Comprehensive documentation is available at [docs.openchat.dev](https://docs.openchat.dev) (or your fumadocs site).

### Quick Links
- [API Reference](docs/api-reference.md)
- [Deployment Guide](docs/deployment.md)
- [Configuration Options](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🚀 Deployment

### Cloudflare Workers (Recommended)

1. **Configure** Cloudflare Workers in `apps/server/wrangler.jsonc`
2. **Deploy** the server: `cd apps/server && bun run deploy`
3. **Deploy** the frontend to Cloudflare Pages or Vercel

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

### Manual Deployment

1. **Build** the applications: `bun build`
2. **Deploy** the server to your preferred platform
3. **Deploy** the frontend to Vercel, Netlify, or similar

## 📊 Performance

- **⚡ Fast Loading** - Optimized bundle sizes with code splitting
- **📊 Real-time Updates** - Efficient WebSocket connections
- **🗄️ Caching Strategy** - Smart caching for offline performance
- **🚀 Edge Deployment** - Global CDN distribution with Cloudflare

## 🔒 Security

- **Authentication** - Secure email/password authentication
- **Data Encryption** - End-to-end encryption for sensitive data
- **CORS Protection** - Proper cross-origin request handling
- **Input Validation** - Comprehensive input sanitization

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ using [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)
- Animations powered by [Framer Motion](https://www.framer.com/motion/)

## 📞 Support

Need help? We're here for you!

- 🐛 [Report Issues](https://github.com/DriftJSLabs/openchat/issues)
- 💡 [Request Features](https://github.com/DriftJSLabs/openchat/issues/new?template=feature_request.md)
- 💬 [Join Discussions](https://github.com/DriftJSLabs/openchat/discussions)
- 📧 [Email Support](mailto:support@driftjs.dev)

---

<div align="center">

**[⭐ Star this repository](https://github.com/DriftJSLabs/openchat/stargazers) if you find it helpful!**

Made with ❤️ by the [DriftJS Labs](https://github.com/DriftJSLabs) team

</div>
