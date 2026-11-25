# waTools

基于 Wails 3、Vue 3、TypeScript 和 Vite 的桌面工具项目，使用官方 Vue 模板初始化。

## 环境要求

- Go 1.26 或更新版本
- Node.js 22.12+ 或 24 LTS，npm
- Wails CLI v3.1.0，与 `go.mod` 和 `@wailsio/runtime` 保持一致
- macOS 需要 Xcode Command Line Tools；其他平台依赖见 [Wails 官方安装文档](https://v3.wails.io/getting-started/installation/)

```sh
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
wails3 doctor
```

确保 Go 的 bin 目录（通常为 `~/go/bin`）已加入 `PATH`。

## 开发

在项目根目录运行：

```sh
wails3 dev
```

首次运行会安装前端依赖、生成 Go/TypeScript 绑定并构建应用，支持前后端热更新。

## 构建与打包

```sh
wails3 build
wails3 package
```

产物位于 `bin/`。macOS 下分别为 `bin/waTools` 和 `bin/waTools.app`。

需要单独检查前端时，先生成绑定，再运行包含类型检查的构建：

```sh
wails3 task common:generate:bindings
npm --prefix frontend ci
npm --prefix frontend run build
```

## 项目结构

- `main.go`：桌面应用入口、窗口和事件配置。
- `greetservice.go`：Go 服务示例，可从 Vue 调用。
- `frontend/src/`：Vue 页面和组件。
- `frontend/bindings/`：Wails 自动生成的 TypeScript 绑定，请通过生成命令更新。
- `frontend/package-lock.json`：前端依赖锁定文件。
- `Taskfile.yml`：构建任务和应用名称。
- `build/config.yml`：应用元信息与开发模式配置。
- `build/`：官方模板生成的各平台构建及打包资源。

修改 `build/config.yml` 的应用元信息后，运行 `wails3 task common:update:build-assets` 同步平台资源。

此命令会覆盖平台构建文件；重新生成后需保留以下调整：

- `build/Taskfile.yml` 使用 `npm ci`，按锁文件安装依赖，避免 `npm install` 在已有 `node_modules` 时改写可选依赖记录。
- macOS 任务使用 `/usr/bin/xattr` 的绝对路径，避免被 PATH 中的同名工具覆盖。
