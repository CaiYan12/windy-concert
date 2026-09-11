/**
 * T5.3 AudioEngine 单测（jsdom project）。注入 FakeAudioElement 替身，断言：
 * preload='auto'、crossOrigin 不设、wc-file 编码范围（整体 filePath）、事件订阅/退订、
 * 能力面委托（play/pause/seek/volume/muted）。
 */
import { describe, expect, it, vi } from 'vitest';
import { buildAudioSrc, createAudioEngine } from './audioEngine';
import { FakeAudioElement } from './playerStubs';

describe('buildAudioSrc（§3.5c 第 1 步 / §3.5f）', () => {
  it('整体 filePath 一次 encodeURIComponent（含盘符冒号、反斜杠、空格、中文）', () => {
    const filePath = 'D:\\音乐\\My Song\\01 - Title.flac';
    expect(buildAudioSrc(filePath)).toBe(
      `wc-file://${encodeURIComponent(filePath)}`
    );
    const src = buildAudioSrc(filePath);
    // wc-file:// 之后无裸空格、无裸路径分隔符（整体编码，非分段编码——留痕见 audioEngine.ts）
    expect(src.startsWith('wc-file://')).toBe(true);
    const encoded = src.slice('wc-file://'.length);
    expect(encoded).not.toMatch(/[ \\/]/); // 编码段内不允许残留空格/斜杠/反斜杠
    expect(encoded).toContain('%20');
    expect(encoded).toContain('%3A'); // 盘符冒号被编码
  });

  it('往返对齐解析侧：decodeURIComponent 还原原路径（protocols.ts 同一约定）', () => {
    const filePath = 'D:\\Music\\日本語\\track 1.mp3';
    const src = buildAudioSrc(filePath);
    const raw = src.slice('wc-file://'.length);
    expect(decodeURIComponent(raw)).toBe(filePath);
  });
});

describe('createAudioEngine', () => {
  it('preload 设为 auto；crossOrigin 不设置（保持 undefined）', () => {
    const el = new FakeAudioElement();
    createAudioEngine({ audio: el });
    expect(el.preload).toBe('auto');
    expect(el.crossOrigin).toBeUndefined();
  });

  it('load 把 wc-file src 写入元素 src（不做额外改写）', () => {
    const el = new FakeAudioElement();
    const engine = createAudioEngine({ audio: el });
    const src = buildAudioSrc('D:\\a.flac');
    engine.load(src);
    expect(el.src).toBe(src);
  });

  it('play/pause/seek/setVolume/setMuted 委托元素；volume 越界钳制 [0,1]', async () => {
    const el = new FakeAudioElement();
    const engine = createAudioEngine({ audio: el });

    await engine.play();
    expect(el.playCalls).toBe(1);
    expect(el.paused).toBe(false);

    engine.pause();
    expect(el.pauseCalls).toBe(1);
    expect(el.paused).toBe(true);

    el.currentTime = 10;
    engine.seek(42);
    expect(el.currentTime).toBe(42);

    engine.setVolume(1.5);
    expect(el.volume).toBe(1);
    engine.setVolume(-0.1);
    expect(el.volume).toBe(0);
    engine.setVolume(0.4);
    expect(el.volume).toBe(0.4);

    engine.setMuted(true);
    expect(el.muted).toBe(true);
  });

  it('seek 对非有限值忽略（无源/元数据未就绪防御）', () => {
    const el = new FakeAudioElement();
    const engine = createAudioEngine({ audio: el });
    el.currentTime = 7;
    engine.seek(Number.NaN);
    expect(el.currentTime).toBe(7);
  });

  it('currentTime/duration/paused/muted 只读透传', () => {
    const el = new FakeAudioElement();
    const engine = createAudioEngine({ audio: el });
    el.currentTime = 12;
    el.duration = 99;
    el.muted = true;
    expect(engine.currentTime).toBe(12);
    expect(engine.duration).toBe(99);
    expect(engine.muted).toBe(true);
    expect(engine.paused).toBe(true);
  });

  it('on 订阅路由到对应事件；unsubscribe 解除（不重复触发）', () => {
    const el = new FakeAudioElement();
    const engine = createAudioEngine({ audio: el });

    const ended = vi.fn();
    const timeupdate = vi.fn();
    const loadedmetadata = vi.fn();
    const error = vi.fn();
    const offEnded = engine.on('ended', ended);
    engine.on('timeupdate', timeupdate);
    engine.on('loadedmetadata', loadedmetadata);
    engine.on('error', error);

    el.emit('ended');
    el.emit('timeupdate');
    el.emit('loadedmetadata');
    el.emit('error');
    expect(ended).toHaveBeenCalledTimes(1);
    expect(timeupdate).toHaveBeenCalledTimes(1);
    expect(loadedmetadata).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    offEnded();
    el.emit('ended');
    expect(ended).toHaveBeenCalledTimes(1); // 已退订
  });
});
