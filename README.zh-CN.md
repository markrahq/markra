<p align="center">
  <img src="apps/desktop/app-icon.svg" width="96" alt="Markra logo" />
</p>

<p align="center">
  <strong>原生支持 AI 的所见即所得 Markdown 编辑器。</strong>
  <br />
  <strong>完全开源，免费使用。数据默认留在本地。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文 | <a href="#下载">下载</a> | <a href="#核心特性">核心特性</a> | <a href="#参与贡献">参与贡献</a> | <a href="#许可证">许可证</a>
</p>

<p align="center">
  <img alt="Desktop" src="https://img.shields.io/badge/Desktop-Tauri-24C8DB" />
  <img alt="WYSIWYG Markdown" src="https://img.shields.io/badge/Markdown-WYSIWYG-000000" />
  <img alt="Native AI" src="https://img.shields.io/badge/AI-Native-7C3AED" />
  <img alt="Free" src="https://img.shields.io/badge/Free-Open_Source-16A34A" />
  <img alt="下载量" src="https://img.shields.io/github/downloads/murongg/markra/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F&amp;color=0EA5E9&amp;cacheSeconds=3600" />
  <img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-important" />
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/markra">
    <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=markra&theme=light" width="250" height="54" alt="在 Product Hunt 上查看 Markra" />
  </a>
</p>

Markra 是一个本地优先的开源 Markdown 编辑器，把 AI 融入写作流程。支持所见即所得和源码两种模式，文件以纯 `.md` 格式保存在本地，AI 可以帮你润色、改写或扩写内容——所有修改都先预览，确认后才写入。

无需云同步，无需注册账号。AI 请求只发往你指定的服务商。

## 截图

<p align="center">
  <img src="assets/screenshots/editor-workspace.png" alt="Markra 所见即所得 Markdown 工作区" />
</p>

<p align="center">
  <strong>所见即所得 Markdown 编辑，本地文件和文档内容在同一个工作区里。</strong>
</p>

| 原生 AI 命令 | 审阅 AI 修改 |
| --- | --- |
| ![Markra inline AI command bar](assets/screenshots/inline-ai-command.png) | ![Markra AI edit preview](assets/screenshots/ai-edit-preview.png) |

| Markra AI 侧边栏 | 多服务商 AI 设置 |
| --- | --- |
| ![Markra AI side panel with document context](assets/screenshots/ai-agent-panel.png) | ![Markra AI provider settings](assets/screenshots/ai-provider-settings.png) |

## 下载

从 [GitHub Releases](https://github.com/murongg/markra/releases/latest) 下载最新桌面版：macOS Apple Silicon/Intel、Windows 安装包/便携包和 Linux AppImage。

## 核心特性

### 所见即所得 Markdown

- 链接、图片、HTML、KaTeX 公式、Mermaid 图表和 GFM 表格均可内联渲染，随时展开回源码。
- 斜杠菜单和拖拽手柄进行块级编辑，一键切换完整源码模式。
- 可调整正文宽度、字号和行高。

### 原生 AI

- 选中文本使用内联 AI，或打开侧边栏处理整篇文档。
- 内置快捷操作：润色、改写、续写、总结、翻译。
- 每次 AI 修改都先预览——接受、拒绝或复制，由你决定。
- 会话支持搜索、重命名和归档。

### 本地工作区

- 打开单个文件或整个文件夹，在文件树中浏览、新建、重命名和删除。
- 文档标签页、大纲导航和双链补全。
- 粘贴图片可存到本地、S3 或 WebDAV。

### 块、表格与代码

- GitHub 风格提示块（note、tip、important、warning、caution）。
- 可视化表格控件，调整行列、尺寸和对齐。
- 语法高亮代码块，支持语言选择和一键复制。

### 主题与导出

- 内置主题或限定作用域的自定义 CSS，支持导入/导出/重置。
- 导出为独立 HTML 或 PDF，完整控制页面、边距和元数据。

### 多服务商 AI

支持云端模型、本地模型和任意 OpenAI 兼容接口，内联编辑和侧边栏可分别选择模型。

**内置服务商：** OpenAI · Anthropic · Google Gemini · DeepSeek · Mistral · Groq · OpenRouter · Together.ai · Qwen · Xiaomi MiMo · Volcengine Ark · xAI · Azure OpenAI · Ollama

**联网搜索：** 服务商原生搜索、Bing 和 SearXNG——结果数量和正文长度均可配置。

## 适用场景

产品文档 · 博客长文 · 研究笔记 · 含表格/代码/公式的技术写作 · AI 辅助起草与润色 · 个人知识库

## 设计理念

- **本地优先** — 文件和工作区数据留在你的磁盘上。
- **开源免费** — 核心功能可审计，永不设付费墙。
- **写作优先** — AI、文件管理和设置都服务于文档，而不是反过来。
- **确认后再应用** — AI 修改是预览，由你决定是否写入。

## 路线图

- 更稳定的工作区行为和边界情况处理
- 更智能的 AI 编辑预览和冲突解决
- 全文搜索和知识整理
- 更丰富的导出模板和分享流程

## 开始使用

1. [下载](https://github.com/murongg/markra/releases/latest)适合你平台的最新版本。
2. 打开一个 Markdown 文件或文件夹。
3. 开始写作——所见即所得、斜杠菜单或源码模式均可。
4. 准备好使用 AI 时，在设置里配置服务商和模型。

## 参与贡献

欢迎贡献——无论是产品体验、Markdown 编辑、AI 工作流、跨平台修复还是文档改进。查看 [issues](https://github.com/murongg/markra/issues) 了解开放任务，或直接发起讨论。

## Star 趋势

<p align="center">
  <a href="https://star-history.com/#murongg/markra&Date">
    <img alt="Markra Star 趋势图" src="https://api.star-history.com/svg?repos=murongg/markra&type=Date" />
  </a>
</p>

## 许可证

Markra 使用 AGPL-3.0 许可证。
