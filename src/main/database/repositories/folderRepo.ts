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
//   T7.3 边界加固（承接项，最小修复面）：
//   - 空串/纯空白拒收：throw（空 path 落库后 getFolders 会把 '' 交给 walker 遍历 cwd，
//     语义错位且难排查，源头拒收）。
//   - 盘符根补回分隔符：'C:\' 去尾后只剩 'c:'——Windows 语义中 'c:' 指「该驱动器当前
//     目录」而非根（语义偏移），归一为 'c:\' 保持根语义（'C:\' 与 'c:\' 收敛为同一形态）。
//   - UNC 主机段小写归一：'\\SERVER\share' → '\\server\share'（主机名大小写不敏感，
//     归一后 UNIQUE 去重稳定；共享名大小写保留——部分设备对共享名大小写敏感，最小面不动）。
//   是否导出：内部使用，不导出（避免跨模块耦合）。具体用例 'D:\Music\' → 'd:\Music'。
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  if (typeof p !== 'string' || p.trim().length === 0) {
    throw new Error(`folderRepo.add: 非法 path "${String(p)}"（空串/纯空白拒收）`);
  }
  let s = p.replace(/[\\/]+$/, ''); // 去尾部所有分隔符
  // UNC：主机段（首个反斜杠前的段）小写归一，形态统一回 '\\' 前缀
  const unc = s.match(/^([\\/]{2})([^\\/]+)/);
  if (unc) {
    s = '\\\\' + unc[2].toLowerCase() + s.slice(unc[0].length);
  }
  s = s.replace(/^[A-Za-z]:/, (m) => m.toLowerCase()); // 小写盘符
  if (/^[A-Za-z]:$/.test(s)) s += '\\'; // 盘符根补回分隔符（'c:' → 'c:\'，保持根语义）
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
