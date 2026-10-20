-- Key items (src/items.ts isKeyItem: the rose and the Video Vault Key) no
-- longer go into the locker (sharedworld.ts rule 19), so any already
-- stowed come back into the pack, where they now stay through a strike
-- too (rule 18). The locker's row is left at zero, as a move leaves it.

INSERT INTO packs (account_id, kind, count)
SELECT account_id, kind, count FROM stashes
WHERE kind IN ('rose', 'vault-key') AND count > 0
ON CONFLICT (account_id, kind) DO UPDATE SET count = count + excluded.count;

UPDATE stashes SET count = 0 WHERE kind IN ('rose', 'vault-key') AND count > 0;
