// The pack store on D1 (migrations/0002_packs.sql): one row per item an
// account has held, and one wallet per account; the cosmetics it has
// (0004_cosmetics.sql); its locker (0007_stashes.sql); its Book of
// Shadows (0008_book.sql); its XP (0010_levels.sql); and its Cabbage
// Stand (0011_stands.sql). Every change is
// a single statement or one batch, which is one transaction,
// statement, so two sockets on one account can never lose a unit or a cent
// between a read and a write.

import { newlyFound } from '../src/book.ts'
import { toCosmetics } from '../src/cosmetics.ts'
import { NO_TASK } from '../src/dailytask.ts'
import { STARTING_INVENTORY, toInventory } from '../src/inventory.ts'
import { isQuest, isQuestStage, QUESTS } from '../src/quests.ts'
import { NO_PROGRESS } from '../src/season.ts'
import { FRESH_STAND, isStandLedger } from '../src/stand.ts'
import { STARTING_CASH } from './packs.ts'
import type { CosmeticId } from '../src/cosmetics.ts'
import type { TaskProgress } from '../src/dailytask.ts'
import type { Inventory } from '../src/interfaces.ts'
import type { QuestId, QuestStage } from '../src/quests.ts'
import type { SeasonProgress, SeasonReward } from '../src/season.ts'
import type { StandChange } from '../src/sharedworld.ts'
import type { StandLedger } from '../src/stand.ts'
import type { Holdings, PackItem, PackStore } from './packs.ts'

interface PackRow {
  kind: string
  count: number
}

export class D1PackStore implements PackStore {
  private readonly db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  // The starting items and wallet go in only where the account has no row
  // for them, so a pack used down to zero or a wallet spent out is never
  // refilled.
  async open(accountId: string): Promise<Holdings> {
    const start = Object.entries(STARTING_INVENTORY).filter(([, n]) => n > 0)
    await this.db.batch([
      this.db
        .prepare(
          'INSERT OR IGNORE INTO wallets (account_id, cash) VALUES (?, ?)'
        )
        .bind(accountId, STARTING_CASH),
      ...start.map(([kind, count]) =>
        this.db
          .prepare(
            'INSERT OR IGNORE INTO packs (account_id, kind, count) VALUES (?, ?, ?)'
          )
          .bind(accountId, kind, count)
      ),
    ])
    return this.get(accountId)
  }

  async get(accountId: string): Promise<Holdings> {
    const [packs, wallet, cosmetics, stash] = await Promise.all([
      this.db
        .prepare('SELECT kind, count FROM packs WHERE account_id = ?')
        .bind(accountId)
        .all<PackRow>(),
      this.db
        .prepare('SELECT cash FROM wallets WHERE account_id = ?')
        .bind(accountId)
        .first<{ cash: number }>(),
      this.db
        .prepare('SELECT cosmetic FROM cosmetics WHERE account_id = ?')
        .bind(accountId)
        .all<{ cosmetic: string }>(),
      this.db
        .prepare('SELECT kind, count FROM stashes WHERE account_id = ?')
        .bind(accountId)
        .all<PackRow>(),
    ])
    return {
      pack: toInventory(
        Object.fromEntries(packs.results.map((row) => [row.kind, row.count]))
      ),
      cash: wallet?.cash ?? 0,
      cosmetics: toCosmetics(cosmetics.results.map((row) => row.cosmetic)),
      stash: toInventory(
        Object.fromEntries(stash.results.map((row) => [row.kind, row.count]))
      ),
    }
  }

  // One batch is one transaction: what is read is what is zeroed.
  async strip(accountId: string): Promise<Inventory> {
    const [held] = await this.db.batch<PackRow>([
      this.db
        .prepare(
          'SELECT kind, count FROM packs WHERE account_id = ? AND count > 0'
        )
        .bind(accountId),
      this.db
        .prepare(
          'UPDATE packs SET count = 0 WHERE account_id = ? AND count > 0'
        )
        .bind(accountId),
    ])
    return Object.fromEntries(
      (held?.results ?? []).map((row) => [row.kind, row.count])
    )
  }

  async give(accountId: string, items: Inventory): Promise<void> {
    const rows = Object.entries(items).filter(([, count]) => count > 0)
    if (rows.length === 0) return
    await this.db.batch(
      rows.map(([kind, count]) =>
        this.db
          .prepare(
            'INSERT INTO packs (account_id, kind, count) VALUES (?, ?, ?) ' +
              'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
          )
          .bind(accountId, kind, count)
      )
    )
  }

  // One batch is one transaction. The units go into one side first, only
  // while the other still holds them; they come out of it after, checking
  // the same, so the two land together or not at all.
  async stow(accountId: string, kind: string, delta: number): Promise<boolean> {
    const count = Math.abs(delta)
    if (count < 1) return false
    const [from, to] = delta > 0 ? ['packs', 'stashes'] : ['stashes', 'packs']
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO ${to} (account_id, kind, count) ` +
            `SELECT ?, ?, ? WHERE (SELECT count FROM ${from} WHERE account_id = ? AND kind = ?) >= ? ` +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(accountId, kind, count, accountId, kind, count),
      this.db
        .prepare(
          `UPDATE ${from} SET count = count - ? ` +
            'WHERE account_id = ? AND kind = ? AND count >= ?'
        )
        .bind(count, accountId, kind, count),
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  async change(
    accountId: string,
    kind: string,
    delta: number
  ): Promise<boolean> {
    if (delta >= 0) {
      await this.db
        .prepare(
          'INSERT INTO packs (account_id, kind, count) VALUES (?, ?, ?) ' +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(accountId, kind, delta)
        .run()
      return true
    }
    const result = await this.db
      .prepare(
        'UPDATE packs SET count = count + ? ' +
          'WHERE account_id = ? AND kind = ? AND count + ? >= 0'
      )
      .bind(delta, accountId, kind, delta)
      .run()
    return result.meta.changes > 0
  }

  // One batch is one transaction. The item goes in first, and only while
  // the wallet still covers the sale; the charge after it checks the same,
  // so the two land together or not at all.
  async purchase(
    accountId: string,
    amount: number,
    item: PackItem | null
  ): Promise<boolean> {
    const charge = this.db
      .prepare(
        'UPDATE wallets SET cash = cash - ? WHERE account_id = ? AND cash >= ?'
      )
      .bind(amount, accountId, amount)
    if (!item) return (await charge.run()).meta.changes > 0
    const results = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO packs (account_id, kind, count) ' +
            'SELECT ?, ?, ? WHERE (SELECT cash FROM wallets WHERE account_id = ?) >= ? ' +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(accountId, item.kind, item.delta, accountId, amount),
      charge,
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  // One batch is one transaction. What he gives goes in first, only while
  // the pack still holds what it is given for; that comes out after,
  // under the same guard, so the two land together or not at all (the
  // two kinds always differ: he takes only what a Citgo shelf prices, and
  // sells nothing it does).
  async barter(
    accountId: string,
    give: { kind: string; count: number },
    take: { kind: string; count: number }
  ): Promise<boolean> {
    const results = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO packs (account_id, kind, count) ' +
            'SELECT ?, ?, ? WHERE (SELECT count FROM packs WHERE account_id = ? AND kind = ?) >= ? ' +
            'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
        )
        .bind(
          accountId,
          take.kind,
          take.count,
          accountId,
          give.kind,
          give.count
        ),
      this.db
        .prepare(
          'UPDATE packs SET count = count - ? WHERE account_id = ? AND kind = ? AND count >= ?'
        )
        .bind(give.count, accountId, give.kind, give.count),
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  // A wallet never opened starts from the starting cash, as open() would.
  async earn(accountId: string, amount: number): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO wallets (account_id, cash) VALUES (?, ?) ' +
          'ON CONFLICT (account_id) DO UPDATE SET cash = cash + ?'
      )
      .bind(accountId, STARTING_CASH + amount, amount)
      .run()
  }

  // One batch is one transaction. The cosmetic goes in first, only while
  // the pack still covers the price and the account has none; the price
  // comes out after it only where that row is the one just written (its
  // trade id), so the two land together or not at all.
  async trade(
    accountId: string,
    price: { kind: string; count: number },
    cosmetic: CosmeticId
  ): Promise<boolean> {
    const id = crypto.randomUUID()
    const results = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO cosmetics (account_id, cosmetic, acquired_at, trade_id) ' +
            'SELECT ?, ?, ?, ? WHERE (SELECT count FROM packs WHERE account_id = ? AND kind = ?) >= ? ' +
            'ON CONFLICT (account_id, cosmetic) DO NOTHING'
        )
        .bind(
          accountId,
          cosmetic,
          Date.now(),
          id,
          accountId,
          price.kind,
          price.count
        ),
      this.db
        .prepare(
          'UPDATE packs SET count = count - ? ' +
            'WHERE account_id = ? AND kind = ? AND count >= ? ' +
            'AND (SELECT trade_id FROM cosmetics WHERE account_id = ? AND cosmetic = ?) = ?'
        )
        .bind(
          price.count,
          accountId,
          price.kind,
          price.count,
          accountId,
          cosmetic,
          id
        ),
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  async season(accountId: string, season: string): Promise<SeasonProgress> {
    const row = await this.db
      .prepare(
        'SELECT kills, claimed FROM seasons WHERE account_id = ? AND season = ?'
      )
      .bind(accountId, season)
      .first<{ kills: number; claimed: number }>()
    return row ? { kills: row.kills, claimed: row.claimed === 1 } : NO_PROGRESS
  }

  // One batch is one transaction: the progress and the reward it paid land
  // together or not at all.
  async score(
    accountId: string,
    season: string,
    progress: SeasonProgress,
    reward: SeasonReward | null
  ): Promise<void> {
    const claimed = progress.claimed ? 1 : 0
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO seasons (account_id, season, kills, claimed) VALUES (?, ?, ?, ?) ' +
            'ON CONFLICT (account_id, season) DO UPDATE SET kills = excluded.kills, claimed = excluded.claimed'
        )
        .bind(accountId, season, progress.kills, claimed),
      ...(reward
        ? [
            this.db
              .prepare(
                'UPDATE wallets SET cash = cash + ? WHERE account_id = ?'
              )
              .bind(reward.cash, accountId),
            this.db
              .prepare(
                'INSERT INTO packs (account_id, kind, count) VALUES (?, ?, ?) ' +
                  'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
              )
              .bind(accountId, reward.kind, reward.count),
          ]
        : []),
    ])
  }

  async book(accountId: string): Promise<string[]> {
    const { results } = await this.db
      .prepare(
        'SELECT entry FROM book WHERE account_id = ? ORDER BY found_at, rowid'
      )
      .bind(accountId)
      .all<{ entry: string }>()
    return results.map((row) => row.entry)
  }

  // Each entry goes in only where the account has no row for it, so one
  // found twice keeps the first time; what goes in is what was not there.
  async discover(
    accountId: string,
    entries: readonly string[],
    now: number
  ): Promise<string[]> {
    const fresh = newlyFound(new Set(await this.book(accountId)), entries)
    if (fresh.length === 0) return []
    const results = await this.db.batch(
      fresh.map((entry) =>
        this.db
          .prepare(
            'INSERT OR IGNORE INTO book (account_id, entry, found_at) VALUES (?, ?, ?)'
          )
          .bind(accountId, entry, now)
      )
    )
    return fresh.filter((_, i) => (results[i]?.meta.changes ?? 0) > 0)
  }

  async quests(accountId: string): Promise<Record<QuestId, QuestStage>> {
    const { results } = await this.db
      .prepare('SELECT quest, stage FROM quests WHERE account_id = ?')
      .bind(accountId)
      .all<{ quest: string; stage: string }>()
    const stages = {} as Record<QuestId, QuestStage>
    for (const id of Object.keys(QUESTS) as QuestId[]) stages[id] = 'none'
    for (const row of results) {
      if (isQuest(row.quest) && isQuestStage(row.stage)) {
        stages[row.quest] = row.stage
      }
    }
    return stages
  }

  // One batch is one transaction. The stage goes first, only while the
  // quest stands where the step found it (no row is 'none') and, for a
  // change out of the pack, while the pack holds it, stamped with this
  // step's id; the pack changes after it only where that stamp is this
  // step's, so the two land together or not at all.
  async quest(
    accountId: string,
    quest: QuestId,
    from: QuestStage,
    to: QuestStage,
    change: { kind: string; delta: number }
  ): Promise<boolean> {
    const id = crypto.randomUUID()
    const out = Math.max(0, -change.delta)
    const stamped =
      '(SELECT step_id FROM quests WHERE account_id = ? AND quest = ?) = ?'
    const results = await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO quests (account_id, quest, stage, step_id, updated_at) ' +
            "SELECT ?, ?, ?, ?, ? WHERE COALESCE((SELECT stage FROM quests WHERE account_id = ? AND quest = ?), 'none') = ? " +
            'AND COALESCE((SELECT count FROM packs WHERE account_id = ? AND kind = ?), 0) >= ? ' +
            'ON CONFLICT (account_id, quest) DO UPDATE SET stage = excluded.stage, step_id = excluded.step_id, updated_at = excluded.updated_at'
        )
        .bind(
          accountId,
          quest,
          to,
          id,
          Date.now(),
          accountId,
          quest,
          from,
          accountId,
          change.kind,
          out
        ),
      change.delta >= 0
        ? this.db
            .prepare(
              'INSERT INTO packs (account_id, kind, count) ' +
                `SELECT ?, ?, ? WHERE ${stamped} ` +
                'ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count'
            )
            .bind(accountId, change.kind, change.delta, accountId, quest, id)
        : this.db
            .prepare(
              'UPDATE packs SET count = count - ? ' +
                `WHERE account_id = ? AND kind = ? AND count >= ? AND ${stamped}`
            )
            .bind(out, accountId, change.kind, out, accountId, quest, id),
    ])
    return (results[1]?.meta.changes ?? 0) > 0
  }

  async task(accountId: string, task: string): Promise<TaskProgress> {
    const row = await this.db
      .prepare(
        'SELECT day, count, claimed FROM tasks WHERE account_id = ? AND task = ?'
      )
      .bind(accountId, task)
      .first<{ day: string; count: number; claimed: number }>()
    return row
      ? { day: row.day, count: row.count, claimed: row.claimed === 1 }
      : NO_TASK
  }

  // One batch is one transaction: the progress and the cents it paid land
  // together or not at all.
  async scoreTask(
    accountId: string,
    task: string,
    progress: TaskProgress,
    reward: number | null
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          'INSERT INTO tasks (account_id, task, day, count, claimed) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT (account_id, task) DO UPDATE SET day = excluded.day, count = excluded.count, claimed = excluded.claimed'
        )
        .bind(
          accountId,
          task,
          progress.day,
          progress.count,
          progress.claimed ? 1 : 0
        ),
      ...(reward
        ? [
            this.db
              .prepare(
                'UPDATE wallets SET cash = cash + ? WHERE account_id = ?'
              )
              .bind(reward, accountId),
          ]
        : []),
    ])
  }

  // The row is made the first time, so a tend always has one to guard.
  async stand(
    accountId: string
  ): Promise<{ ledger: StandLedger; rev: number }> {
    const [, read] = await this.db.batch<StandRow>([
      this.db
        .prepare('INSERT OR IGNORE INTO stands (account_id) VALUES (?)')
        .bind(accountId),
      this.db
        .prepare(
          'SELECT level, stock, banked, since, rev FROM stands WHERE account_id = ?'
        )
        .bind(accountId),
    ])
    const row = read?.results[0]
    if (!row) return { ledger: FRESH_STAND, rev: 0 }
    let stock: unknown
    try {
      stock = JSON.parse(row.stock)
    } catch {
      stock = null
    }
    const ledger = {
      level: row.level,
      stock,
      banked: row.banked,
      since: row.since,
    }
    // A row no build could have written reads as a fresh stand, and the
    // next tend overwrites it.
    return {
      ledger: isStandLedger(ledger) ? ledger : FRESH_STAND,
      rev: row.rev,
    }
  }

  // One batch is one transaction, and every statement in it fails rather
  // than do nothing: the stand's write count goes negative when it is not
  // `rev` any more, and a pack row or a wallet goes negative when it falls
  // short, each against its CHECK, so the whole batch is rolled back. (An
  // upsert cannot carry a negative count: SQLite checks the row it would
  // insert before the conflict turns it into an update.)
  async tend(
    accountId: string,
    rev: number,
    { ledger, items, cash }: Pick<StandChange, 'ledger' | 'items' | 'cash'>
  ): Promise<boolean> {
    const statements = [
      // The row first, so the guarded write below always finds one.
      this.db
        .prepare('INSERT OR IGNORE INTO stands (account_id) VALUES (?)')
        .bind(accountId),
      this.db
        .prepare(
          'UPDATE stands SET level = ?, stock = ?, banked = ?, since = ?, ' +
            'rev = CASE WHEN rev = ? THEN rev + 1 ELSE -1 END WHERE account_id = ?'
        )
        .bind(
          ledger.level,
          JSON.stringify(ledger.stock),
          ledger.banked,
          ledger.since,
          rev,
          accountId
        ),
      // A pack row the account never had is made at zero first, so taking
      // from it fails its CHECK like a short one.
      ...Object.entries(items)
        .filter(([, count]) => count > 0)
        .flatMap(([kind, count]) => [
          this.db
            .prepare(
              'INSERT OR IGNORE INTO packs (account_id, kind, count) VALUES (?, ?, 0)'
            )
            .bind(accountId, kind),
          this.db
            .prepare(
              'UPDATE packs SET count = count - ? WHERE account_id = ? AND kind = ?'
            )
            .bind(count, accountId, kind),
        ]),
      ...(cash > 0
        ? [
            this.db
              .prepare(
                'INSERT INTO wallets (account_id, cash) VALUES (?, ?) ' +
                  'ON CONFLICT (account_id) DO UPDATE SET cash = cash + ?'
              )
              .bind(accountId, STARTING_CASH + cash, cash),
          ]
        : cash < 0
          ? [
              this.db
                .prepare(
                  'INSERT OR IGNORE INTO wallets (account_id, cash) VALUES (?, 0)'
                )
                .bind(accountId),
              this.db
                .prepare(
                  'UPDATE wallets SET cash = cash + ? WHERE account_id = ?'
                )
                .bind(cash, accountId),
            ]
          : []),
    ]
    try {
      await this.db.batch(statements)
      return true
    } catch (err) {
      if (err instanceof Error && /CHECK constraint failed/.test(err.message)) {
        return false
      }
      throw err
    }
  }

  async xp(accountId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT xp FROM levels WHERE account_id = ?')
      .bind(accountId)
      .first<{ xp: number }>()
    return row?.xp ?? 0
  }

  // One statement: two grants landing together each add theirs.
  async gainXp(accountId: string, amount: number): Promise<number> {
    const row = await this.db
      .prepare(
        'INSERT INTO levels (account_id, xp) VALUES (?, ?) ' +
          'ON CONFLICT (account_id) DO UPDATE SET xp = xp + excluded.xp ' +
          'RETURNING xp'
      )
      .bind(accountId, amount)
      .first<{ xp: number }>()
    if (!row) throw new Error('The XP was not written')
    return row.xp
  }
}

interface StandRow {
  level: number
  stock: string
  banked: number
  since: number
  rev: number
}
