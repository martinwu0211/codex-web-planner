# Codex Web Planner 运行引擎

此目录是 Codex Web Planner plugin 内置的本地运行时，负责启动工作区 Bridge、
提供受限 MCP 地址、等待用户完成 ChatGPT 授权，并记录本地状态和用量。

它属于公开的 `codex-web-planner` plugin。用户应通过 Codex 安装 plugin，
不需要单独安装本目录或其他上游产品。上游 MIT 许可证和来源声明保留在
`LICENSE` 与 `../THIRD_PARTY_NOTICES.md` 中。

## 开发

源码检出后使用 `pnpm install` 和 `pnpm build`。公开 plugin 已包含 `dist/`，
干净安装只需要生产依赖。
