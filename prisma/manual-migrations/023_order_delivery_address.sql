-- 023: orders with no delivery address take the project's (2026-09-29). Data only.
-- New orders get it at creation (siteAddress in helper/orderValidation.js).
UPDATE `Order` o JOIN `Project` p ON p.`id` = o.`projectId`
SET o.`deliveryAddress` = COALESCE(NULLIF(TRIM(p.`address`), ''), CONCAT_WS(', ', NULLIF(TRIM(p.`siteName`), ''), NULLIF(TRIM(p.`projectLocation`), '')))
WHERE o.`deliveryAddress` IS NULL OR TRIM(o.`deliveryAddress`) = '';
