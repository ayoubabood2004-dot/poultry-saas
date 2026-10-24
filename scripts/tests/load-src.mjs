// افحص المصدر لا نسخة منه: esbuild يحزم الملف الحقيقي من src/ بالذاكرة، والفحص يستورد الناتج.
// «فحص على نسخة يفحص النسخة».
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadSrc(relativePath) {
  const result = await build({
    entryPoints: [path.join(ROOT, relativePath)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', __APP_VERSION__: '"test"' },
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
