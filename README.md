# Docker Native Manager

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.1-blue?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

A modern, native, and blazing-fast desktop application to manage your Docker environments, built with **Tauri v2**, **React**, **TypeScript**, and **Rust**.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/1b10e3eb-415b-47d0-8974-6bf47bac9585" />

## ✨ Features

- **Containers Management**: Start, stop, restart, create, and delete containers.
- **Real-Time Stats**: Monitor CPU and Memory usage live for running containers.
- **Live Logs Viewer**: View and debug container output streams with ease.
- **Images**: Pull new images directly from Docker Hub, list local images, and delete them.
- **Volumes & Networks**: Full CRUD operations to keep your local environment clean.
- **Docker Compose / Stacks**: Deploy `.yaml` stacks and manage multi-container services in one place.
- **Native UI/UX**: Custom frameless window, transparent backgrounds, and dark mode built on top of Shadcn UI and Tailwind CSS.
- **Fast & Lightweight**: Interacts directly with the Docker Daemon via Rust (`bollard` crate), skipping heavy intermediate servers or electron bloat.

## 🚀 Getting Started

### Prerequisites

- Node.js (`v20` or higher recommended)
- `pnpm` (Package manager)
- Rust (latest stable version)
- Docker Desktop or Docker Engine running locally

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pedrofariasx/dockernativemanager.git
   cd dockernativemanager
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm tauri dev
   ```

## 📦 Building for Production

To create a standalone application installer:

```bash
pnpm tauri build
```

The resulting binaries will be placed in the `src-tauri/target/release/bundle` directory.

## 🛠️ Technologies Used

- **Frontend**:
  - React 19
  - Vite
  - Tailwind CSS
  - Shadcn UI (Radix Primitives)
  - Lucide Icons
- **Backend (Tauri)**:
  - Rust
  - Bollard (Docker API client)
  - Tokio (Asynchronous runtime)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check [issues page](https://github.com/pedrofariasx/dockernativemanager/issues).

## 📝 License

This project is [MIT](https://opensource.org/licenses/MIT) licensed.
