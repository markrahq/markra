# Dependency patches

## `@codemirror/view@6.41.1`

On macOS 26 and later, WebKit reads `focus({ preventScroll: true })` but
can still reset ancestor scroll positions. CodeMirror already works around
this for Safari 26+, but WKWebView omits the `Version/` user-agent token and
is detected as Safari version 0.

The patch enables the existing scroll-restoration fallback for that unknown
Safari version in both the ESM and CommonJS entry points. This keeps the
pointer position stable across the first focus and prevents a single click
from becoming a range selection ([#736](https://github.com/markrahq/markra/issues/736)).

Remove the patch when an upstream release handles versionless WKWebView
focus without scrolling. Keep `packages/editor/src/codemirror/focus.test.ts`
passing when upgrading the dependency or removing the patch.
