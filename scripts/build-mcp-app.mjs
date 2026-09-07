import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['ui/mcp-app.js'], bundle: true, minify: true, write: false, platform: 'browser', target: 'es2022', format: 'iife', legalComments: 'inline' });
const template = await readFile('ui/mcp-app.html', 'utf8');
const html = template.replace('__APP_SCRIPT__', () => result.outputFiles[0].text.replaceAll('</script', '<\\/script'));
await writeFile('public/mcp-app.html', html.replace(/[ \t]+$/gm, ''));
console.log('Built MCP upload/download interface.');
