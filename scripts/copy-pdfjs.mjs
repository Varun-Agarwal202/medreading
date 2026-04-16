import fs from 'fs/promises';
import path from 'path';

async function main() {
  const root = process.cwd();
  const srcDir = path.join(root, 'node_modules', 'pdfjs-dist', 'legacy', 'build');
  const outDir = path.join(root, 'public', 'vendor', 'pdfjs');

  await fs.mkdir(outDir, { recursive: true });

  const files = ['pdf.mjs', 'pdf.worker.mjs'];
  for (const f of files) {
    const src = path.join(srcDir, f);
    const dst = path.join(outDir, f);
    await fs.copyFile(src, dst);
  }

  // eslint-disable-next-line no-console
  console.log('[postinstall] Copied PDF.js assets to public/vendor/pdfjs');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[postinstall] Failed to copy PDF.js assets:', err);
  process.exit(1);
});

