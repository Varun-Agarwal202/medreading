import fs from 'fs/promises';
import path from 'path';

export default async function handler(_req, res) {
  try {
    const base = process.cwd();
    const candidates = [
      path.join(base, 'public', 'books'),
      path.join(base, 'public')
    ];

    const found = [];
    for (const dir of candidates) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
            found.push({ dir: dir.replace(base, ''), name: e.name });
          }
        }
      } catch {
        // ignore missing dirs
      }
    }

    return res.status(200).json({ pdfs: found });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
}

