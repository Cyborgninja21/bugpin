import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import { resolvePathInside } from '../../../src/server/utils/safe-path';

describe('resolvePathInside', () => {
  const base = path.resolve('/tmp/bugpin-avatars');

  it('resolves a simple filename under the base directory', () => {
    expect(resolvePathInside(base, 'usr_1', 'avatar.png')).toBe(
      path.resolve(base, 'usr_1', 'avatar.png')
    );
  });

  it('rejects encoded-style traversal segments', () => {
    expect(resolvePathInside(base, 'usr_1', '..')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', '../outside.txt')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', '..\\outside.txt')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', 'a/b.png')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', 'a\\b.png')).toBeNull();
  });

  it('rejects empty, dot, and NUL segments', () => {
    expect(resolvePathInside(base, 'usr_1', '')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', '.')).toBeNull();
    expect(resolvePathInside(base, 'usr_1', 'av\0atar.png')).toBeNull();
  });
});
