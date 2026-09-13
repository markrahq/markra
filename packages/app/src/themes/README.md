# Markra themes / Markra 主题

## Use a theme / 使用主题

1. Open Settings → Appearance → Open theme folder.
2. Copy `starter-light.css` or `starter-dark.css` to a new `.css` file in this folder.
3. Enable Custom theme and select a file for each appearance.
4. Edit and save the file in your text editor, then click Refresh themes in Markra.

在「设置 → 外观」打开主题文件夹，复制浅色或深色模板为新的 `.css` 文件。
开启「自定义主题」后，分别选择浅色、深色主题文件。用文本编辑器修改并保存后，点击「刷新主题」即可应用到所有窗口。

Templates are created once. Markra updates and refreshes never overwrite your files or restore deleted templates.
Only CSS files directly inside this folder are listed. File names and themes are local to this computer; copy them separately when moving to another device. Existing CSS import/export and portable settings backups contain the CSS entered in Settings, not these files.

模板只在首次初始化时创建，升级或刷新不会覆盖修改或恢复已删除的模板。只扫描本目录下的 CSS 文件。
主题文件和选择记录保存在本机，换设备时请单独复制；设置备份和 CSS 导入导出仍处理设置中填写的 CSS。

## Supported variables / 常用变量

Use `:root[data-theme="custom"]` for the app and `.markdown-paper[data-editor-theme="custom"]` for the document. The starter files list the main color and heading variables.

应用界面使用 `:root[data-theme="custom"]`；正文使用 `.markdown-paper[data-editor-theme="custom"]`。模板列出了主要颜色和标题变量。

```css
:root[data-theme="custom"] .markdown-paper[data-editor-theme="custom"] {
  --editor-font-family: "Example Serif", serif;
  --editor-heading-font-family: "Example Serif", serif;
  --editor-code-font-family: "Example Mono", monospace;
  --editor-h1-font-size: 40px;
  --editor-h1-color: #2563eb;
  --editor-code-bg: #f6f8fa;
}
```

Replace the example fonts with fonts installed on your computer. The code font variable covers inline code, fenced code, and rendered preview code. Body font settings take precedence when an explicit editor font is selected; choose Theme default to use the theme's body font.

字体名称请替换为本机已安装的字体。代码字体变量作用于行内代码、围栏代码块和预览中的代码。编辑器字体设置优先于主题正文字体，使用主题字体时请选择「主题默认」。

## Boundaries / 使用范围

- This version supports self-contained UTF-8 CSS files up to 1 MiB and installed fonts. Relative `url(...)`, local font/image assets, and `@import` theme bundles are not supported yet.
- These are Markra themes. Typora-specific selectors such as `#write` require adaptation.
- CSS applies to the app and editor. HTML/PDF exports use their own export styles.
- CodeMirror owns editable line geometry. Prefer variables; changing `.cm-line` height, display, padding or line-height can break cursor placement and selection. Code row size and line-height are intentionally not exposed as theme variables.
- Missing or unreadable files fall back to the saved CSS in Settings. The selected file name is retained: restore the file and refresh, or select Custom CSS to use the settings editor again.
- Custom CSS can style the whole app. Disable Custom theme to return to the built-in palettes.

当前支持最大 1 MiB 的独立 UTF-8 CSS 和本机已安装字体；暂不支持相对路径资源、主题包导入或自动刷新。
Typora 的 `#write` 等选择器需要适配。HTML/PDF 导出使用独立样式。
编辑行的高度和间距由 CodeMirror 管理，直接修改可能导致光标和选区错位；请优先使用变量。
文件丢失或无法读取时会回退到设置中保存的 CSS，并保留文件选择，修复后刷新即可恢复。
