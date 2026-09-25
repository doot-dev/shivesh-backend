-- 013: one order status (user decision 2026-09-26). Replaces Order.status +
-- Order.deliveryStatus with a single flow:
--   NEW → CONFIRMED → DISPATCHED → REACHED → COMPLETED, plus DELAYED and CANCELLED.
-- TmDetail.status (per truck) is unchanged. Back up the DB before running.

-- 1. Let the column hold old and new values while rows are moved.
ALTER TABLE `Order` MODIFY `status`
  ENUM('NEW','CONFIRMED','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED','DELAYED','DISPATCHED','REACHED')
  NOT NULL DEFAULT 'NEW';

-- 2. Map every order from its old pair. A delivery step of COMPLETED on an
--    order that was never completed becomes REACHED, so completing it still
--    runs billing instead of skipping it.
UPDATE `Order` SET `status` = CASE
  WHEN `status` IN ('NEW', 'COMPLETED', 'CANCELLED') THEN `status`
  WHEN `status` = 'DELIVERED' OR `deliveryStatus` IN ('REACHED', 'DELIVERED', 'COMPLETED') THEN 'REACHED'
  WHEN `deliveryStatus` = 'IN_TRANSIT' THEN 'DISPATCHED'
  ELSE 'CONFIRMED'
END;

-- 3. Only the new values remain.
ALTER TABLE `Order` MODIFY `status`
  ENUM('NEW','CONFIRMED','DELAYED','DISPATCHED','REACHED','COMPLETED','CANCELLED')
  NOT NULL DEFAULT 'NEW';

ALTER TABLE `Order` DROP COLUMN `deliveryStatus`;
