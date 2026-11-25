# waTools 前端

Vue 3 + TypeScript + Element Plus，使用 Vite 构建。

```sh
npm ci
npm run dev
npm run build
npm test
```

- `src/tools/`：时间戳、URL 编解码、日志还原和文本分行页面。
- `src/lib/`：独立转换逻辑，由 `tests/tools.test.mjs` 验证。
- `src/components/CopyButton.vue`：桌面 / 浏览器剪贴板与 Element Plus 消息反馈。
- `src/styles.css`：窗口布局、编辑器样式和响应式适配。

页面组件按需导入 Element Plus，图标使用 `@element-plus/icons-vue`。桌面开发请在项目根目录运行 `wails3 dev`。
