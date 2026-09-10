// T1.4 coverRepo —— 封面持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';
// §3.1 UUID 行：cover_art.id 用 crypto.randomUUID()（Node 内置，无需额外依赖）。
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type CoverSource = 'embedded' | 'folder';

/** insertCover 输入：封面来源必填，其余为可选元数据（folder 来源才填 originalPath）。
 * T2.4 扩签：id 可选预生成——封面目录名需先于落库确定（文件命名与 db 行原子一致），
 * coverService 用 crypto.randomUUID() 预生成后传入；未传则仍由 repo 生成（原行为不变）。 */
export interface CoverInsert {
  id?: string;
  source: CoverSource;
  originalPath?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface CoverRepo {
  /** insertCover → 封面 id（T2.4 扩签：传入预生成 id 则原样使用，否则 crypto.randomUUID()，§3.1 UUID 行）。 */
  insertCover(cover: CoverInsert): string;
  /** setAlbumCover 联动 albums.cover_id（封面归属专辑的唯一落点）。 */
  setAlbumCover(albumId: number, coverId: string): void;
}

export function createCoverRepo(db: Database): CoverRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  const stmtInsert = db.prepare(`
    INSERT INTO cover_art (id, source, original_path, mime, width, height)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const stmtSetAlbumCover = db.prepare(`
    UPDATE albums SET cover_id = ?, updated_at = datetime('now') WHERE id = ?
  `);

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function insertCover(cover: CoverInsert): string {
    const id = cover.id ?? randomUUID(); // §3.1：UUID 由 repo 生成并回传（T2.4 扩签：可传预生成 id）。
    stmtInsert.run(
      id,
      cover.source,
      cover.originalPath ?? null,
      cover.mime ?? null,
      cover.width ?? null,
      cover.height ?? null,
    );
    return id;
  }

  function setAlbumCover(albumId: number, coverId: string): void {
    stmtSetAlbumCover.run(coverId, albumId);
  }

  return {
    insertCover,
    setAlbumCover,
  };
}
