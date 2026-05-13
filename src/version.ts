import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const PACKAGE_VERSION = (() => {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  const v = pkg.version;
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`omg: "${pkgPath}" must contain a non-empty string "version"`);
  }
  return v;
})();
