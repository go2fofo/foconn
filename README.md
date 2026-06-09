


███████╗ ██████╗  ██████╗  ██████╗ ███╗   ██╗███╗   ██╗
 ██╔════╝██╔═══██╗██╔════╝ ██╔═══██╗████╗  ██║████╗  ██║
 █████╗  ██║   ██║██║      ██║   ██║██╔██╗ ██║██╔██╗ ██║
 ██╔══╝  ██║   ██║██║      ██║   ██║██║╚██╗██║██║╚██╗██║
 ██║     ╚██████╔╝╚██████╗ ╚██████╔╝██║ ╚████║██║ ╚████║
 ╚═╝      ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═══╝


---

## 1. 项目介绍 (Introduction)

**Foconn** 是一款基于 **Tauri 2.0** 与 **Rust** 异步生态构建的跨平台、全能型远程连接与终端管理客户端。它旨在通过轻量化的 WebView 渲染层与高性能的 Rust 原生异步核心，彻底摆脱传统 Electron 架构客户端的沉重与臃肿，提供具备极致启动速度、极低内存占用与工业级安全的“一站式”多协议控制中心。

## 项目展示 (Project Showcase)doc文件下查看截图



---

### 核心特性矩阵

* **全协议支持**:
* **字符终端**: Local Terminal (本地 PTY)、SSH、Telnet、SerialPort (串口)。
* **文件系统**: 高性能 SFTP、传统 FTP / 安全 FTPS（支持双栏拖拽、断点续传）。
* **图形桌面**: 基于 Rust 像素级流式解码与前端 Canvas 硬件加速渲染的 RDP、VNC、Spice 客户端。


* **重构级交互体验 (UI/UX)**:
* **全局智能吸附悬浮球**: 常驻屏幕边缘，支持 Hover 弹性微动画，一键唤醒万能连接面板。
* **分流接入设计**: 顶部 `[ ＋ ]` 按钮深度收敛为紧凑的快捷下拉菜单，避免干扰常规流。
* **底部快操命令流水线**: 针对 SSH 与本地终端，支持自定义命令卡片，一键直推至活动 `xterm.js` 实例自动执行。
* **特色 VFS 导航**: 尊享高级行级选中样式、路径收藏夹弹窗（Popover 架构）、手动输入路径与实时刷新。
* **完全定制化 Context Menu**: 纯前端声明式 JSON 驱动的右键上下文菜单，支持区间多选（Shift/Cmd）与批量传输。



---

## 2. 安装依赖 (Prerequisites)

由于 Foconn 基于 Tauri 2.0 构建，在运行和编译项目前，你需要配置各平台对应的 Rust 和原生开发环境。

### 基础通用环境

1. 安装 [Node.js](https://nodejs.org/) (建议 v20+)
2. 安装 [Rust 编译环境](https://www.rust-lang.org/tools/install) (建议 Stable 1.75+)
3. 推荐安装包管理器 [pnpm](https://pnpm.io/) (`npm i -g pnpm`)

### 操作系统特定环境依赖

请严格参考 Tauri 2.0 官方文档配置宿主环境：

* **Windows**: 安装 [Visual Studio Build Tools](https://www.google.com/search?q=https://visualstudio.microsoft.com/visual-cpp-build-tools/) 并勾选 "C++ 桌面开发"。
* **macOS**: 打开终端执行 `xcode-select --install` 安装 Xcode 命令行工具。
* **Linux (Ubuntu/Debian)**: 运行以下命令安装 WebKit 引擎及系统底层依赖：
```bash
sudo apt-get update
sudo apt-get install -y libsoup-3.0-dev libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

```



---

## 3. 运行项目 (Getting Started)

### 3.1 克隆仓库并安装前端依赖

```bash
pnpm install

```

### 3.2 启动开发预览模式

Tauri 将同时拉起前端 Vite 服务与后端 Rust 核心进程，并开启热重载（HMR）以及本地捕获的内核标准错误日志输出：

```bash
pnpm tauri dev

```

### 3.3 生产构建与打包

该命令将对前端资产进行压缩混淆，并调用 Rust 编译器生成对应平台的原生安装包（如 Windows `.msi`、macOS `.dmg`、Linux `.deb`）：

```bash
pnpm tauri build

```


---

## 5. 项目配置 (Project Configuration)

### 5.1 更换及一键生成应用图标

如果你需要更新 Foconn 的应用图标，只需准备一张 `1024x1024` 像素、PNG 格式的正方形高清原图（如 `app-logo.png`），在根目录下运行 Tauri CLI 指令：

```bash
pnpm tauri icon ./app-logo.png

```

CLI 引擎会自动批量裁剪并格式化覆写 `src-tauri/icons` 下的所有文件，在下次 `dev` 或 `build` 时无缝应用。

### 5.2 核心安全与能力配置 (`tauri.conf.json`)

在 Tauri 2.0 中，严格的安全沙箱和作用域隔离是底线。以下是 Foconn 的核心功能与凭据安全配置示范：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Foconn",
  "version": "1.0.0",
  "identifier": "com.fo.foconn",
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self';"
    }
  },
  "plugins": {
    "fs": {
      "scope": ["$DOWNLOADS/*", "$APPCACHE/*"]
    }
  }
}

```
### 关键目录说明

- `src/components`
  - `WorkspaceLayout.tsx`：工作区总布局
  - `Terminal.tsx`：终端渲染与会话读写
  - `VfsPanel.tsx`：SFTP 文件管理与传输入口
  - `ServerView.tsx`：SSH / SFTP 组合视图
  - `Home.tsx`：仪表盘首页
- `src/store`
  - `workspaceStore.ts`：标签页、书签、快速命令、历史等状态
  - `vfsStore.ts`：传输任务状态
  - `globalLoadingStore.ts`：全局 Loading 管理
- `src-tauri/src/lib.rs`
  - 本地终端创建
  - SSH 连接与远程终端
  - SFTP 文件浏览与传输
  - 书签与快速命令持久化

### Tauri 配置

配置文件位置：

```text
src-tauri/tauri.conf.json
```

当前关键配置：

- `beforeDevCommand`: `npm run dev`
- `devUrl`: `http://localhost:1420`
- `beforeBuildCommand`: `npm run build`
- `frontendDist`: `../dist`
- 默认窗口大小：`1280 x 900`


### 国际化配置

国际化初始化文件：

```text
src/i18n.ts
```

当前语言策略：

- 默认语言：`zh`
- 回退语言：`en`

### 数据持久化说明

当前项目中的书签、快速命令等配置通过 Tauri 后端落盘存储，运行时会写入系统应用配置目录。



> **凭据物理存储规范**:
> Foconn 严禁将任何主机的明文密码或密钥路径固化存储在上述 JSON 文件中。配置记录只会存储凭据的 UUID 引用。在实际建立通道连接时，Rust 后端会通过本地安全桥接，调取各 OS 的原生硬件级秘密存储（macOS **Keychain** / Windows **Credential Manager** / Linux **Secret Service**）动态解密读取。