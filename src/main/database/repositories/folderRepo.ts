// T1.4 folderRepo —— 媒体库目录持久化收口点（§4.3-4：repo 是唯一 SQL 收口点）。
// 类型仅从相对路径 import shared（main 侧无 @shared 别名）。
import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 目录行形态：自定留痕（FolderRow 由本 repo 收口定义）。 */
export interface FolderRow {
  id: number;
  path: string;
  enabled: boolean; // INTEGER(0/1) → boolean
  recursive: boolean; // 建表默认 1；当前 UI 不暴露，原样回传
}

// ---------------------------------------------------------------------------
// 工厂
// ---------------------------------------------------------------------------

export interface FolderRepo {
  /** add(path) → 目录行。path 规范化：小写盘符 + 去尾部分隔符（见 normalizePath 留痕）。 */
  add(path: string): FolderRow;
  remove(id: number): void;
  setEnabled(id: number, enabled: boolean): void;
  list(): FolderRow[];
}

// ---------------------------------------------------------------------------
// path 规范化（派发决定留痕）
//   - 去尾部 \ 或 /（多斜杠一并清掉，避免 'D:\Music\\' 残留）。
//   - 盘符小写：'^[A-Za-z]:' → 小写（Windows 路径区分大小写无关但规范化需稳定，便于 UNIQUE 去重）。
//   是否导出：内部使用，不导出（避免跨模块耦合）。具体用例 'D:\Music\' → 'd:\Music'。
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  let s = p.replace(/[\\/]+$/, ''); // 去尾部所有分隔符
  s = s.replace(/^[A-Za-z]:/, (m) => m.toLowerCase()); // 小写盘符
  return s;
}

export function createFolderRepo(db: Database): FolderRepo {
  // 固定 arity 的 prepared statements 在工厂内创建一次（形态对齐 trackRepo）。
  const stmtInsert = db.prepare(`
    INSERT INTO library_folders (path) VALUES (?)
  `);
  const stmtRemove = db.prepare(`
    DELETE FROM library_folders WHERE id = ?
  `);
  const stmtSetEnabled = db.prepare(`
    UPDATE library_folders SET enabled = ? WHERE id = ?
  `);
  const stmtGetAfterInsert = db.prepare(`
    SELECT id, path, enabled, recursive FROM library_folders WHERE id = ?
  `);
  const stmtList = db.prepare(`
    SELECT id, path, enabled, recursive FROM library_folders ORDER BY path ASC
  `);

  // -------------------------------------------------------------------------
  // 映射收口
  // -------------------------------------------------------------------------

  function mapFolderRow(raw: Record<string, unknown>): FolderRow {
    return {
      id: raw.id as number,
      path: raw.path as string,
      enabled: (raw.enabled as number) === 1,
      recursive: (raw.recursive as number) === 1,
    };
  }

  // -------------------------------------------------------------------------
  // 方法实现
  // -------------------------------------------------------------------------

  function add(path: string): FolderRow {
    const norm = normalizePath(path);
    const info = stmtInsert.run(norm);
    const id = info.lastInsertRowid as number;
    const row = stmtGetAfterInsert.get(id) as Record<string, unknown>;
    return mapFolderRow(row);
  }

  function remove(id: number): void {
    stmtRemove.run(id);
  }

  function setEnabled(id: number, enabled: boolean): void {
    stmtSetEnabled.run(enabled ? 1 : 0, id);
  }

  function list(): FolderRow[] {
    const rows = stmtList.all() as Record<string, unknown>[];
    return rows.map(mapFolderRow);
  }

  return {
    add,
    remove,
    setEnabled,
    list,
  };
}
