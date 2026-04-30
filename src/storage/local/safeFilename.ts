// Shared filename safety check used by both the voyage CRUD path and the
// bundle import path. The regex requires the filename to start with an
// alphanumeric so dotfiles (`.htaccess`, `.gitignore`-style names) can't
// land in the share. Subsequent characters can include `.`, `_`, `-`.
//
// We additionally reject any `..` substring so even an inert
// `legitname..json` is rejected — relative-path traversal is a non-starter
// regardless of where the directory handle is rooted.

import { PathSafetyError } from './errors';

const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function ensureSafeFilename(filename: unknown): asserts filename is string {
  if (
    typeof filename !== 'string' ||
    !filename ||
    !FILENAME_RE.test(filename) ||
    filename.includes('..')
  ) {
    throw new PathSafetyError(`Invalid filename: ${JSON.stringify(filename)}`);
  }
}
