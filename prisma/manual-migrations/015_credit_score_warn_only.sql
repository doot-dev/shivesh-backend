-- 015: credit warns, never blocks (2026-09-28). Data only, no schema change.
-- Every panel role gets the new creditScore.view (the green/orange/red bar,
-- no amounts); take it away per role in Roles & Permissions.
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
SELECT `id`, 'creditScore.view' FROM `Role` WHERE `isDeleted` = false;

-- Orders held by the old credit gate are released: nothing blocks on it now.
UPDATE `Order`
SET `creditHold` = false,
    `creditReleasedAt` = NOW(),
    `creditReleaseNote` = 'Auto-released: credit now warns only (migration 015)'
WHERE `creditHold` = true;
