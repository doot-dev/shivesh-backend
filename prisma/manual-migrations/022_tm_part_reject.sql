-- 022: part rejection of a truck (2026-09-29). A 6 CBM truck where the site
-- keeps 5 and 1 is wasted: rejectedQty = 1, billed / credit qty = qty − rejectedQty.
ALTER TABLE `TmDetail` ADD COLUMN `rejectedQty` DOUBLE NULL;
