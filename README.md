# Docker Native Manager

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.1-blue?logo=tauri)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange?logo=rust)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

A modern, native, and blazing-fast desktop application to manage your Docker environments, built with **Tauri v2**, **React**, **TypeScript**, and **Rust**.

![alt text](<dockernm.png>)

## ✨ Features

- **Dynamic Dashboard**: Real-time overview of your Docker system, including container counts, image storage, and host resource availability (CPU/RAM).
- **Containers Management**: Full control with start, stop, restart, delete, and advanced creation (Ports, Envs, Volumes).
- **Interactive Terminal**: Access container shells directly with a built-in terminal (powered by xterm.js).
- **Bulk Actions**: Select multiple containers or images to perform operations like start, stop, or delete in one go.
- **Real-Time Event Driven**: UI updates instantly using Tauri Events, eliminating unnecessary polling and reducing resource usage.
- **Advanced Filtering**: Quickly find resources with instant search and status-based filters (Running, Exited, etc.).
- **Resource Inspection**: Deep-dive into any resource (Containers, Images, Volumes, Networks) with a built-in JSON inspector.
- **Live Logs & Stats**: Monitor CPU/Memory usage and view log streams directly from the native backend.
- **Theme Support**: Seamlessly switch between Dark and Light modes.
- **Volumes & Networks**: Full management of data storage and virtual networks.
- **Docker Compose / Stacks**: Deploy and manage multi-container projects with ease.
- **System Maintenance**: One-click `Docker System Prune` to reclaim disk space instantly.

## 🚀 Getting Started

### Prerequisites

- Node.js (`v20` or higher recommended)
- `pnpm` (Package manager)
- Rust (latest stable version)
- Docker Desktop or Docker Engine running locally

### Distributions using DPKG (Debian, Ubuntu, Mint, etc.)
```bash
sudo apt install ./docker-native-manager-x.y.z-x86_64.deb
```
### Distributions using RPM (Fedora/openSUSE, etc.)
```bash
sudo dnf install ./docker-native-manager-x.y.z-x86_64.rpm
sudo zypper install ./docker-native-manager-x.y.z-x86_64.rpm
```
### Distributions using ALPM (Arch Linux, CachyOS, SteamOS, etc.)
```bash
sudo pacman -U ./docker-native-manager-x.y.z-x86_64.pkg.tar.zst 
```

### Portable installation (AppImage)
```bash
chmod +x docker-native-manager-x.y.z-x86_64.AppImage && ./docker-native-manager-x.y.z-x86_64.AppImage
```

### Manual Installation

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=pedrofariasx/dockernativemanager&type=Date)](https://www.star-history.com/#pedrofariasx/dockernativemanager&Date)
