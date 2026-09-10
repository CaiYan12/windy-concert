import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/database/connection';
import { createCoverRepo, type CoverRepo } from '../../../src/main/database/repositories/coverRepo';
import type { Database } from 'better-sqlite3';

interface Ctx {
  db: Database;
  coverRepo: CoverRepo;
}

function setup(): Ctx {
  const db = openDatabase(':memory:');
  const coverRepo = createCoverRepo(db);
  return { db, coverRepo };
}

let current: Ctx | null = null;
afterEach(() => {
  if (current) {
    current.db.close();
    current = null;
  }
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('coverRepo', () => {
  it('insertCover 回传 crypto.randomUUID() 形态的 id（§3.1 UUID 行）', () => {
    current = setup();
    const { db, coverRepo } = current;
    const id = coverRepo.insertCover({ source: 'embedded', mime: 'image/jpeg', width: 512, height: 512 });
    expect(typeof id).toBe('string');
    expect(id).toMatch(UUID_RE); // UUID v4 形态

    const row = db.prepare(`SELECT id, source, mime, width, height FROM cover_art WHERE id = ?`).get(id) as {
      id: string;
      source: string;
      mime: string | null;
      width: number | null;
      height: number | null;
    };
    expect(row.source).toBe('embedded');
    expect(row.mime).toBe('image/jpeg');
    expect(row.width).toBe(512);
    expect(row.height).toBe(512);
  });

  it('insertCover folder 来源可带 originalPath，其余元数据为 NULL 默认', () => {
    current = setup();
    const { db, coverRepo } = current;
    const id = coverRepo.insertCover({ source: 'folder', originalPath: '/covers/x.jpg' });
    const row = db.prepare(`SELECT source, original_path, mime, width, height FROM cover_art WHERE id = ?`).get(id) as {
      source: string;
      original_path: string | null;
      mime: string | null;
      width: number | null;
      height: number | null;
    };
    expect(row.source).toBe('folder');
    expect(row.original_path).toBe('/covers/x.jpg');
    expect(row.mime).toBeNull();
    expect(row.width).toBeNull();
    expect(row.height).toBeNull();
  });

  it('setAlbumCover 联动 albums.cover_id', () => {
    current = setup();
    const { db, coverRepo } = current;
    db.prepare(`INSERT INTO artists (id, name) VALUES (1, 'A')`).run();
    const albumId = (
      db.prepare(`INSERT INTO albums (title, artist_id) VALUES ('Al', 1)`).run().lastInsertRowid as number
    );

    const coverId = coverRepo.insertCover({ source: 'embedded' });
    coverRepo.setAlbumCover(albumId, coverId);

    const row = db.prepare(`SELECT cover_id FROM albums WHERE id = ?`).get(albumId) as { cover_id: string | null };
    expect(row.cover_id).toBe(coverId);

    // 换封面：cover_id 被覆盖
    const cover2 = coverRepo.insertCover({ source: 'folder', originalPath: '/c2.jpg' });
    coverRepo.setAlbumCover(albumId, cover2);
    const row2 = db.prepare(`SELECT cover_id FROM albums WHERE id = ?`).get(albumId) as { cover_id: string | null };
    expect(row2.cover_id).toBe(cover2);
  });
});
