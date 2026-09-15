# Markra themes / Markra 主题

## Use a theme / 使用主题

1. Open Settings → Appearance. Use Choose theme folder for an existing CSS directory, or keep the default. Open theme folder opens the active directory.
2. Add a CSS file, or copy `starter-light.css` or `starter-dark.css` from the default folder.
3. Enable Custom theme and select a file for each appearance.
4. Edit and save the file in your text editor, then click Refresh themes in Markra.

在「设置 → 外观」选择已有主题文件夹，或保留默认目录。「打开主题文件夹」会打开当前目录，可复制浅色或深色模板为新的 `.css` 文件。
开启「自定义主题」后，分别选择浅色、深色主题文件。用文本编辑器修改并保存后，点击「刷新主题」即可应用到所有窗口。

One directory is active at a time, and its path is shown in Settings. The folder choice survives restarts and is synchronized across windows. Switching to a different directory clears file choices to avoid applying a different file with the same name; choose the new folder's light/dark files afterward. Use default folder returns to Markra's managed directory. Cancelling the picker keeps the current choice. If a saved folder becomes unavailable, the saved settings CSS is used until you restore the folder and refresh or choose another directory.

一次使用一个目录，设置中会显示当前路径，并在重启后保留、在窗口间同步。切换到不同目录时会清空文件选择，避免误用同名文件，请重新选择浅色和深色主题。点击「恢复默认文件夹」可回到默认目录；取消选择保留原设置。已保存的目录不可用时，会暂时使用设置中的 CSS，可恢复目录后刷新或重新选择目录。

Templates are created once in the default directory only. Custom folders, including an existing Typora themes folder, are read without adding, moving or changing files. Markra updates and refreshes never overwrite your files or restore deleted templates.
Only CSS files directly inside this folder are listed. File names and themes are local to this computer; copy them separately when moving to another device. Existing CSS import/export and portable settings backups contain the CSS entered in Settings, not these files.

模板只在默认目录首次初始化时创建。自定义目录（包括已有 Typora 主题目录）只读取，不会添加、移动或修改文件。升级或刷新不会覆盖修改或恢复已删除的模板。只扫描本目录下的 CSS 文件。
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

## Basic Typora compatibility / Typora 基础兼容

You can select a Typora CSS file from this folder or use the existing Import CSS action in Settings. Markra detects common Typora selectors and variables and adapts their basic styles at load time. The original stylesheet stays unchanged, including when exported from the settings editor.

可直接选择文件夹中的 Typora CSS 文件，也可通过设置里的「导入 CSS」加载。Markra 会识别常见 Typora 选择器和变量，在加载时转换基础样式；原始文件和设置中保存、导出的 CSS 保持不变。

Supported basics:

- Palette variables such as `--bg-color`, `--text-color`, `--primary-color`, `--side-bar-bg-color` and `--monospace`.
- Basic foreground/background colors and installed font families on `html`, `body` and `#write`.
- H1–H6 colors, font families, weights, letter spacing and simple sizes in `px`, `pt`, `em`, `rem` or `%`. Relative heading sizes are resolved against the source theme's font sizes; app controls and the editor's body-size setting retain their own sizes.
- Links, inline code and fenced-code colors; `.md-fences`, `pre.md-fences` and `.cm-s-inner` fonts/backgrounds; common `.cm-keyword`, `.cm-string`, `.cm-number`, `.cm-def`, `.cm-type`, `.cm-meta` and `.cm-comment` colors.
- CSS variable inheritance/fallbacks and ordinary selector specificity, source order and `!important` for the supported rules.

基础兼容范围包括：常用配色变量、正文和标题字体、标题颜色/字重/字距/简单字号、链接与代码颜色，以及常见代码高亮。相对标题字号按照源主题换算，应用控件和正文字号继续使用 Markra 设置。

This is a partial adapter, not a replica of Typora's DOM. Layout and spacing rules, tables/lists/callout layouts, pseudo-elements, interactive selectors, CSS nesting, cascade layers, conditional rules (`@media`/`@supports`), font shorthands and complex heading sizes are skipped. Bundled fonts/images and imported stylesheets are not loaded. The Settings panel reports skipped rules, resource dependencies and CSS parse errors. Missing values use the selected appearance's Markra starter palette. Stylesheets already targeting `.markdown-paper` use Markra's native CSS path.

这不是完整的 Typora 页面结构兼容层。布局与间距、表格/列表/引用布局、伪元素、交互选择器、嵌套、层叠层、条件规则、字体简写和复杂标题字号暂不转换；附带字体、图片及导入样式表也不加载。设置中会提示这些限制和 CSS 解析问题。缺失样式使用对应浅色或深色的 Markra 基础配色。已有 `.markdown-paper` 规则的样式表继续按 Markra 原生 CSS 加载。

## Boundaries / 使用范围

- This version supports self-contained UTF-8 CSS files up to 1 MiB and installed fonts. Relative `url(...)`, local font/image assets, and `@import` theme bundles are not supported yet.
- Typora themes use the basic adapter described above; full visual equivalence is not guaranteed.
- CSS applies to the app and editor. HTML/PDF exports use their own export styles.
- CodeMirror owns editable line geometry. Prefer variables; changing `.cm-line` height, display, padding or line-height can break cursor placement and selection. Code row size and line-height are intentionally not exposed as theme variables.
- Missing or unreadable files fall back to the saved CSS in Settings. The selected file name is retained: restore the file and refresh, or select Custom CSS to use the settings editor again.
- Custom CSS can style the whole app. Disable Custom theme to return to the built-in palettes.

当前支持最大 1 MiB 的独立 UTF-8 CSS 和本机已安装字体；暂不支持相对路径资源、主题包导入或自动刷新。
Typora 主题按上述范围做基础适配，不保证完整视觉还原。HTML/PDF 导出使用独立样式。
编辑行的高度和间距由 CodeMirror 管理，直接修改可能导致光标和选区错位；请优先使用变量。
文件丢失或无法读取时会回退到设置中保存的 CSS，并保留文件选择，修复后刷新即可恢复。
