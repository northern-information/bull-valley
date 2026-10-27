-- The Undercroft's tunnel shades are drawn as shadow rats, and their Book
-- of Shadows page (src/book.ts) is renamed from 'tunnel-shade' to
-- 'shadow-rat'. Every account that found the old page keeps it, found
-- when it was, under the new name, so it is not news again and its
-- bounty is not paid twice.

INSERT OR IGNORE INTO book (account_id, entry, found_at)
SELECT account_id, 'shadow-rat', found_at FROM book WHERE entry = 'tunnel-shade';

DELETE FROM book WHERE entry = 'tunnel-shade';
