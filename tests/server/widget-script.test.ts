import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveWidgetScript } from '../../src/server/widget-script';

let dir: string;
let filePath: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'bugpin-widget-'));
  filePath = path.join(dir, 'widget.js');
  writeFileSync(filePath, 'console.log("widget");');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const get = (headers: Record<string, string> = {}) =>
  serveWidgetScript(filePath, new Request('https://bugpin.test/widget.js', { headers }));

describe('serveWidgetScript', () => {
  it('makes browsers revalidate instead of caching for an hour', async () => {
    const res = await get();
    expect(res?.status).toBe(200);
    expect(res?.headers.get('cache-control')).toBe('public, no-cache');
    expect(res?.headers.get('etag')).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
    expect(res?.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res?.text()).toBe('console.log("widget");');
  });

  it('answers 304 when the browser already has this version', async () => {
    const etag = (await get())!.headers.get('etag')!;
    expect((await get({ 'If-None-Match': etag }))?.status).toBe(304);
    expect((await get({ 'If-None-Match': `W/${etag}` }))?.status).toBe(304);
    expect((await get({ 'If-None-Match': '"old-version"' }))?.status).toBe(200);
  });

  it('serves the new file once the widget is rebuilt', async () => {
    const etag = (await get())!.headers.get('etag')!;
    await Bun.sleep(5);
    writeFileSync(filePath, 'console.log("widget v2, longer");');
    const res = await get({ 'If-None-Match': etag });
    expect(res?.status).toBe(200);
    expect(await res?.text()).toContain('v2');
  });

  it('falls back to If-Modified-Since', async () => {
    const lastModified = (await get())!.headers.get('last-modified')!;
    expect((await get({ 'If-Modified-Since': lastModified }))?.status).toBe(304);
    expect((await get({ 'If-Modified-Since': 'Thu, 01 Jan 2004 00:00:00 GMT' }))?.status).toBe(200);
  });

  it('returns null when the widget is missing', async () => {
    expect(
      await serveWidgetScript(path.join(dir, 'missing.js'), new Request('https://bugpin.test/'))
    ).toBeNull();
  });
});
