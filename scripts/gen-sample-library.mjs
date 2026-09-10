#!/usr/bin/env node
/**
 * 样本库生成脚本（T2.7，附录 B 契约，纯 Node 内置、零依赖）
 *
 * 用法: node scripts/gen-sample-library.mjs --count 30000 --out D:/PerfLib [--force]
 *
 * 契约（附录 B）:
 * - 结构: 混合 3 层嵌套目录；文件名 Track-{i}.mp3 / {i}.flac 交替（全局 i 从 1 计，
 *   奇数 i → mp3 槽 `Track-{i}.mp3`，偶数 i → flac 槽 `{i}.flac`）。
 * - 每 50 首的第 1 首（i % 50 === 1）复制带标签 fixture 测解析路径:
 *     mp3 槽  → tests/fixtures/music/01-夜曲.mp3
 *     flac 槽 → tests/fixtures/music/02-夜曲.flac
 *   【留痕适配】附录原文仅点名 01-夜曲.mp3；flac 槽用标签版属最小适配。
 *   注: i % 50 === 1 恒为奇数，故在本计数方案下 flac 标签分支实际不触发，
 *   代码保留该分支以完整覆盖契约（若未来改为按槽位计数即可生效）。
 * - 其余复制静音/无标签 fixture 测回退路径:
 *     mp3 槽  → tests/fixtures/music/album2/07-Track07.mp3
 *       【留痕适配】附录写作 tests/fixtures/music/07-Track07.mp3，该 fixture 实际位于
 *       album2/ 子目录。其为 V1.4 后仅含 album/album_artist 的最小标签，title 仍回退
 *       文件名，回退路径语义成立。
 *     flac 槽 → tests/fixtures/music/04-untagged.flac
 * - 执行前检查目标磁盘剩余空间 > 2GB（另加按均摊字节的估算下限，见 estimateBytes）。
 * - 目录分布: out/艺术家{a..j}/专辑{n}/文件 —— 10 个艺术家目录，保证 Albums/Artists
 *   聚合有真实数据量。曲目按 count 均分到 10 个艺术家（余数摊前 rem 个）；每艺术家
 *   专辑数自定为 5（曲目不足 5 首时取曲目数，保证各专辑目录真实存在、总数恰为 N）。
 *   极小 count（<10）下部分艺术家分不到曲目，此时跳过其目录。
 * - 幂等/安全: --out 已存在且非空 → 报错退出；--force 可清空重建（自定提供，留痕）。
 * - 结束打印统计: 生成文件数、目录数、耗时、总字节数。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIXTURE_DIR = path.join(PROJECT_ROOT, 'tests', 'fixtures', 'music');
const ARTISTS = [...'abcdefghij']; // 艺术家a .. 艺术家j，共 10 个
const ALBUMS_PER_ARTIST = 5;
const TAGGED_EVERY = 50; // 每 50 首的第 1 首为标签版
const MIN_FREE_BYTES = 2 * 1024 ** 3; // 2GB
const SAFETY_MARGIN = 1.1; // 估算余量 10%

const FIXTURES = {
  mp3Tagged: path.join(FIXTURE_DIR, '01-夜曲.mp3'),
  mp3Untagged: path.join(FIXTURE_DIR, 'album2', '07-Track07.mp3'),
  flacTagged: path.join(FIXTURE_DIR, '02-夜曲.flac'),
  flacUntagged: path.join(FIXTURE_DIR, '04-untagged.flac'),
};

const USAGE = `用法: node scripts/gen-sample-library.mjs --count <N> --out <dir> [--force]
  --count N    生成文件总数（默认 30000）
  --out <dir>  样本库输出目录（必填）
  --force      目标目录已存在且非空时，清空重建（危险操作，谨慎使用）`;

function fail(msg) {
  console.error(`[gen-sample-library] 错误: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { count: 30000, force: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') {
      args.count = Number(argv[++i]);
      if (!Number.isInteger(args.count) || args.count <= 0) fail(`--count 须为正整数，得到: ${argv[i]}`);
    } else if (a === '--out') {
      args.out = argv[++i];
      if (!args.out) fail('--out 需要一个目录参数');
    } else if (a === '--force') {
      args.force = true;
    } else {
      fail(`未知参数: ${a}\n${USAGE}`);
    }
  }
  if (!args.out) fail(`缺少必填参数 --out\n${USAGE}`);
  return args;
}

function checkFixtures() {
  for (const [key, p] of Object.entries(FIXTURES)) {
    if (!existsSync(p)) fail(`fixture 缺失 (${key}): ${p}`);
  }
}

/** 目标磁盘剩余空间检查：free > max(2GB, 估算值)。估算值 = 均摊字节数 × count × 1.1 余量。 */
function checkDiskSpace(out, count) {
  const sizes = Object.fromEntries(
    Object.entries(FIXTURES).map(([k, p]) => [k, statSync(p).size]),
  );
  const avgBytes = Math.ceil(
    (sizes.mp3Tagged + sizes.mp3Untagged + sizes.flacTagged + sizes.flacUntagged) / 4,
  );
  const estimateBytes = Math.ceil(avgBytes * count * SAFETY_MARGIN);
  const driveRoot = path.parse(path.resolve(out)).root || path.resolve(out);
  let freeBytes;
  try {
    const fsStat = statfsSync(driveRoot);
    freeBytes = fsStat.bavail * fsStat.bsize;
  } catch (err) {
    fail(`无法读取目标磁盘剩余空间 (${driveRoot}): ${err.message}`);
  }
  const required = Math.max(MIN_FREE_BYTES, estimateBytes);
  console.log(
    `[gen-sample-library] 磁盘检查: ${driveRoot} 剩余 ${(freeBytes / 1024 ** 3).toFixed(2)} GB；` +
      `要求 > 2GB 且 > 估算值。估算式: 均摊 ${avgBytes} B/文件 × ${count} × ${SAFETY_MARGIN} 余量 = ` +
      `${(estimateBytes / 1024 ** 3).toFixed(2)} GB`,
  );
  if (freeBytes <= required) {
    fail(
      `目标磁盘剩余空间不足: 仅 ${(freeBytes / 1024 ** 3).toFixed(2)} GB，` +
        `要求 > ${Math.max(2, estimateBytes / 1024 ** 3).toFixed(2)} GB（2GB 硬门槛与均摊估算取大者）`,
    );
  }
}

/**
 * 分配算法: count 均分到 10 个艺术家（base + 前 rem 个 +1）；每艺术家专辑数
 * = min(5, tracks)（至少 1）；每专辑 = floor(tracks/albumCount)，余数摊前几张。
 * 返回 [{artist, album, files}]，保证 sum(files) === count。
 */
function planDistribution(count) {
  const base = Math.floor(count / ARTISTS.length);
  const rem = count % ARTISTS.length;
  const plan = [];
  ARTISTS.forEach((letter, idx) => {
    const tracks = base + (idx < rem ? 1 : 0);
    if (tracks === 0) return; // 极小 count 下分不到曲目的艺术家跳过
    const albumCount = Math.max(1, Math.min(ALBUMS_PER_ARTIST, tracks));
    const per = Math.floor(tracks / albumCount);
    let extra = tracks % albumCount;
    for (let n = 1; n <= albumCount; n++) {
      const files = per + (extra-- > 0 ? 1 : 0);
      if (files > 0) plan.push({ artist: `艺术家${letter}`, album: `专辑${n}`, files });
    }
  });
  return plan;
}

function ensureEmptyTarget(out, force) {
  if (existsSync(out)) {
    const entries = readdirSync(out);
    if (entries.length > 0) {
      if (force) {
        console.log(`[gen-sample-library] --force: 清空已存在目录 ${out}`);
        rmSync(out, { recursive: true, force: true });
      } else {
        fail(`目标目录已存在且非空: ${out}\n如需清空重建请加 --force`);
      }
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = path.resolve(args.out);
  const started = Date.now();

  checkFixtures();
  checkDiskSpace(out, args.count);
  ensureEmptyTarget(out, args.force);

  const plan = planDistribution(args.count);
  mkdirSync(out, { recursive: true });

  let i = 1; // 全局文件序号，从 1 计
  let files = 0;
  let totalBytes = 0;
  let dirCount = 1; // 含 out 根目录
  const fixtureSizes = Object.fromEntries(
    Object.entries(FIXTURES).map(([k, p]) => [k, statSync(p).size]),
  );

  for (const group of plan) {
    const dir = path.join(out, group.artist, group.album);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      dirCount++;
    }
    for (let k = 0; k < group.files; k++, i++) {
      const isMp3 = i % 2 === 1; // 奇数 → mp3 槽，偶数 → flac 槽
      const tagged = i % TAGGED_EVERY === 1; // 每 50 首的第 1 首为标签版
      const name = isMp3 ? `Track-${i}.mp3` : `${i}.flac`;
      const srcKey = isMp3 ? (tagged ? 'mp3Tagged' : 'mp3Untagged') : (tagged ? 'flacTagged' : 'flacUntagged');
      copyFileSync(FIXTURES[srcKey], path.join(dir, name));
      files++;
      totalBytes += fixtureSizes[srcKey];
      if (files % 5000 === 0) {
        console.log(`[gen-sample-library] 进度: ${files}/${args.count}`);
      }
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  console.log('========== 生成完成 ==========');
  console.log(`输出目录 : ${out}`);
  console.log(`生成文件 : ${files}（预期 ${args.count}）`);
  console.log(`目录数   : ${dirCount}（1 根 + 艺术家 + 专辑）`);
  console.log(`总字节数 : ${totalBytes} B (${(totalBytes / 1024 ** 2).toFixed(2)} MB)`);
  console.log(`耗时     : ${seconds} s`);
  if (files !== args.count) fail(`生成文件数 ${files} 与预期 ${args.count} 不一致`);
}

main();
