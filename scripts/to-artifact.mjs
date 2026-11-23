// Turns the single-file build (dist-single/index.html) into page content for a
// claude.ai artifact, which supplies its own <html>/<head>/<body> skeleton.
import { readFile, writeFile } from "node:fs/promises";

const html = await readFile("dist-single/index.html", "utf8");
const title = (html.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? "InCommon";

// The inlined JS contains HTML-looking strings (the sample data renders Takeout HTML),
// so slice by the outermost tags instead of matching patterns inside the code.
const scriptOpen = '<script type="module" crossorigin>';
const styleOpen = '<style rel="stylesheet" crossorigin>';
const sStart = html.indexOf(scriptOpen);
const cssStart = html.lastIndexOf(styleOpen);
const sEnd = html.lastIndexOf("</script>", cssStart);
const cssEnd = html.lastIndexOf("</style>", html.lastIndexOf("</head>"));
if (sStart < 0 || cssStart < 0 || sEnd < sStart || cssEnd < cssStart) throw new Error("Unexpected single-file layout");
const scripts = '<script type="module">' + html.slice(sStart + scriptOpen.length, sEnd) + "</script>";
const styles = "<style>" + html.slice(cssStart + styleOpen.length, cssEnd) + "</style>";

const out = [
  `<title>${title}</title>`,
  `<meta name="claude:viewport-fit-sides" content="cover">`,
  `<meta name="description" content="Compare your Google history with a friend's and find what you have in common. Runs entirely in your browser.">`,
  styles,
  `<div id="root"></div>`,
  scripts,
].join("\n");
await writeFile("dist-single/artifact.html", out);
console.log(`dist-single/artifact.html ${(out.length / 1024).toFixed(0)} KB`);
