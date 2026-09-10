// T3.2 protocols 单测——纯函数直驱，零 electron（§3.5f 安全校验点逐条覆盖）。
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createFolderCache,
  resolveAudioRequest,
  resolveCoverRequest,
} from '../../../src/main/library/protocols';

// ---------------------------------------------------------------------------
// 测试夹具：Windows 形态路径（folderRepo 规范化后：小写盘符 + 无尾分隔符）
// ---------------------------------------------------------------------------

const FOLDER = 'd:\\music';
const buildFileUrl = (p: string): string => `wc-file://${encodeURIComponent(p)}`;

describe('resolveAudioRequest', () => {
  it('合法前缀命中放行（大小写不敏感）', () => {
    const r = resolveAudioRequest(buildFileUrl('d:\\Music\\a.mp3'), [FOLDER]);
    expect(r).toEqual({ filePath: 'd:\\Music\\a.mp3' });
  });

  it('启用目录大小写不同也放行', () => {
    const r = resolveAudioRequest(buildFileUrl('d:\\music\\a.mp3'), ['d:\\MUSIC']);
    expect(r).toEqual({ filePath: 'd:\\music\\a.mp3' });
  });

  it('请求路径与启用目录整体相等放行（相等分支）', () => {
    const r = resolveAudioRequest(buildFileUrl('d:\\music'), [FOLDER]);
    expect(r).toEqual({ filePath: 'd:\\music' });
  });

  it('d:\\music2 边界不放行（分隔符边界校验）', () => {
    const r = resolveAudioRequest(buildFileUrl('d:\\music2\\x.mp3'), [FOLDER]);
    expect(r).toHaveProperty('error');
  });

  it('../ 编码穿越不放行（normalize 击穿后前缀失配）', () => {
    const r = resolveAudioRequest(buildFileUrl('d:\\music\\..\\..\\secret.mp3'), [FOLDER]);
    expect(r).toHaveProperty('error');
  });

  it('未启用目录不放行', () => {
    const r = resolveAudioRequest(buildFileUrl('e:\\elsewhere\\x.mp3'), [FOLDER]);
    expect(r).toHaveProperty('error');
  });

  it('URL 解析还原正确（中文与空格 encodeURIComponent）', () => {
    const p = 'd:\\音乐库\\我的 歌.mp3';
    const r = resolveAudioRequest(buildFileUrl(p), ['d:\\音乐库']);
    expect(r).toEqual({ filePath: p });
  });

  it('非 URL / 空 host / 非法百分号编码均返回 error', () => {
    expect(resolveAudioRequest('not a url', [FOLDER])).toHaveProperty('error');
    expect(resolveAudioRequest('wc-file://', [FOLDER])).toHaveProperty('error');
    expect(resolveAudioRequest('wc-file://a%ZZb', [FOLDER])).toHaveProperty('error');
  });
});

describe('resolveCoverRequest', () => {
  const UUID = 'e6f1a2b3-4c5d-4e6f-8a9b-0c1d2e3f4a5b';
  const coversDir = 'C:\\Users\\x\\AppData\\Roaming\\wc\\covers';
  const buildCoverUrl = (id: string, s?: number): string =>
    `wc-cover://${id}${s === undefined ? '' : `?s=${s}`}`;

  it('合法 UUID + s 白名单（64/256/512）', () => {
    for (const s of [64, 256, 512]) {
      expect(resolveCoverRequest(buildCoverUrl(UUID, s), coversDir)).toEqual({
        filePath: path.join(coversDir, UUID, `${s}.jpg`),
      });
    }
  });

  it('缺省 s=256（对齐媒体形态 wc-cover://{coverId}?s=256）', () => {
    expect(resolveCoverRequest(buildCoverUrl(UUID), coversDir)).toEqual({
      filePath: path.join(coversDir, UUID, '256.jpg'),
    });
  });

  it('非 UUID 拒绝（防路径穿越 coversDir）', () => {
    expect(resolveCoverRequest(buildCoverUrl('..%5C..%5Cwin'), coversDir)).toHaveProperty('error');
    expect(resolveCoverRequest(buildCoverUrl('abc'), coversDir)).toHaveProperty('error');
    expect(resolveCoverRequest(buildCoverUrl(''), coversDir)).toHaveProperty('error');
  });

  it('s=999 / s=abc / s 为空均拒绝', () => {
    expect(resolveCoverRequest(buildCoverUrl(UUID, 999), coversDir)).toHaveProperty('error');
    expect(resolveCoverRequest(buildCoverUrl(UUID, 1), coversDir)).toHaveProperty('error');
    expect(resolveCoverRequest(`wc-cover://${UUID}?s=abc`, coversDir)).toHaveProperty('error');
  });

  it('其余 query 忽略（s 命中白名单即放行）', () => {
    expect(resolveCoverRequest(`wc-cover://${UUID}?s=64&extra=1`, coversDir)).toEqual({
      filePath: path.join(coversDir, UUID, '64.jpg'),
    });
  });
});

describe('createFolderCache', () => {
  it('get() 命中缓存（来源仅首调拉取一次）', () => {
    const getFolders = vi.fn(() => [FOLDER]);
    const cache = createFolderCache(getFolders);
    expect(cache.get()).toEqual([FOLDER]);
    expect(cache.get()).toEqual([FOLDER]);
    expect(getFolders).toHaveBeenCalledTimes(1);
  });

  it('invalidate() 失效后下次 get() 重拉', () => {
    const getFolders = vi.fn(() => [FOLDER]);
    const cache = createFolderCache(getFolders);
    cache.get();
    cache.invalidate();
    expect(cache.get()).toEqual([FOLDER]);
    expect(getFolders).toHaveBeenCalledTimes(2);
  });
});
