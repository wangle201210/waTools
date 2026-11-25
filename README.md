# waTools

基于 Wails 3、Vue 3、Element Plus、TypeScript 和 Vite 的桌面工具箱，支持本地文本处理和 Redis 查询。

## 工具

- **时间戳转换**：秒 / 毫秒 / 微秒 / 纳秒自动识别或手动选择，保留纳秒精度、日期反向转换，以及本地、北京时间、UTC 三种时区。
- **URL 编解码**：实时处理百分号编码，支持中文和 Unicode；可选择表单模式，将 `+` 与空格互转。每次只解码一层，非法编码会显示错误。
- **Token 查询**：支持直连 Redis 和 Sentinel，地址、Master 名称和 DB 均通过界面配置；源码不包含实际环境的连接地址。每行一个 userID，批量读取 `l:usr:token:{userID}`（例如 `l:usr:token:123`），提取 JSON 中的 `token` 字段，也兼容直接存储 token 字符串。结果显示 userID 与 token 映射，支持逐行复制和批量复制。查询历史在本机保存 userID、连接配置、DB 和查询时间，可搜索、回填或再次查询；token 查询结果不会写入历史。
- **文本分行**：默认“日志还原”模式，把字面量 `\n` / `\r\n` 还原为换行、`\t` 还原为缩进，保留普通空格、空行和堆栈结构。“按分隔符分行”模式支持空格、Tab、中英文逗号 / 分号和自定义分隔符，并可去除空白、空行或重复行。左右两栏可拖动中间分隔线调整宽度，也可恢复等宽。

各工具支持一键复制。当前工具页、输入内容、时区与单位、分行选项和两栏比例会自动保存在本机，下次打开时恢复；实时当前时间会重新读取系统时钟。

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
npm --prefix frontend test
```

## 项目结构

- `main.go`：桌面应用入口、窗口和服务配置。
- `be/tokenservice.go`：Redis token 只读查询服务，包含输入校验、超时和按行错误反馈。
- `frontend/src/tools/`：各工具页面。
- `frontend/src/lib/`：日期、URL、日志还原和文本分行逻辑。
- `frontend/src/components/`：复制按钮和图标等共享组件。
- `frontend/tests/`：使用 Node.js 内置测试运行器验证转换结果。
- `frontend/bindings/`：Wails 自动生成的 TypeScript 绑定，请通过生成命令更新。
- `frontend/package-lock.json`：前端依赖锁定文件。
- `Taskfile.yml`：构建任务和应用名称。
- `build/config.yml`：应用元信息与开发模式配置。
- `build/`：官方模板生成的各平台构建及打包资源。

修改 `build/config.yml` 的应用元信息后，运行 `wails3 task common:update:build-assets` 同步平台资源。

此命令会覆盖平台构建文件；重新生成后需保留以下调整：

- `build/Taskfile.yml` 使用 `npm ci`，按锁文件安装依赖，避免 `npm install` 在已有 `node_modules` 时改写可选依赖记录。
- macOS 任务使用 `/usr/bin/xattr` 的绝对路径，避免被 PATH 中的同名工具覆盖。
