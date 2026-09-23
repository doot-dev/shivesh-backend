-- IAM: real roles and permissions for the admin panel.
--
-- Before: `User.menuAccess` was a JSON array of magic numbers ([1,2,3]) that the
-- panel wrote and then ignored — login never even returned it, the sidebar was
-- hardcoded, and every admin API route accepted any logged-in user. In practice
-- every user was a full administrator.
--
-- After: a `Role` is a named bundle of permission strings ("orders.create"),
-- users point at a role, and `UserPermission` layers per-user ALLOW/DENY
-- exceptions on top. `User.isSuperAdmin` bypasses all checks.
--
--   mysql --host=<host> --user=<user> --password <db> < prisma/manual-migrations/007_iam_roles_permissions.sql
--   npx prisma generate
--
-- Run order matters: the Super Admin role is created and backfilled BEFORE
-- anything starts enforcing, so existing admins never lose access mid-deploy.

-- 1. Roles.
CREATE TABLE `Role` (
  `id`          INTEGER      NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(191) NOT NULL,
  `description` TEXT         NULL,
  `isSystem`    BOOLEAN      NOT NULL DEFAULT false,
  `isActive`    BOOLEAN      NOT NULL DEFAULT true,
  `isDeleted`   BOOLEAN      NOT NULL DEFAULT false,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Role_name_key` (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Permissions granted to a role. One row per key so grants are queryable.
CREATE TABLE `RolePermission` (
  `id`         INTEGER      NOT NULL AUTO_INCREMENT,
  `roleId`     INTEGER      NOT NULL,
  `permission` VARCHAR(191) NOT NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `RolePermission_roleId_permission_key` (`roleId`, `permission`),
  INDEX `RolePermission_roleId_idx` (`roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RolePermission`
  ADD CONSTRAINT `RolePermission_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Per-user exceptions. DENY beats ALLOW beats the role grant.
CREATE TABLE `UserPermission` (
  `id`         INTEGER               NOT NULL AUTO_INCREMENT,
  `userId`     INTEGER               NOT NULL,
  `permission` VARCHAR(191)          NOT NULL,
  `effect`     ENUM('ALLOW','DENY')  NOT NULL DEFAULT 'ALLOW',
  `createdAt`  DATETIME(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserPermission_userId_permission_key` (`userId`, `permission`),
  INDEX `UserPermission_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserPermission`
  ADD CONSTRAINT `UserPermission_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. User gains a role pointer and the super-admin flag.
--    `menuAccess` becomes nullable: it is legacy and new code never writes it,
--    but it is NOT dropped so a rollback still has its data.
ALTER TABLE `User`
  ADD COLUMN `roleId`       INTEGER NULL,
  ADD COLUMN `isSuperAdmin` BOOLEAN NOT NULL DEFAULT false,
  MODIFY COLUMN `menuAccess` JSON NULL;

ALTER TABLE `User`
  ADD INDEX `User_roleId_fkey` (`roleId`);

ALTER TABLE `User`
  ADD CONSTRAINT `User_roleId_fkey`
  FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Seed the system Super Admin role. isSystem = it cannot be edited or
--    deleted from the panel, which is what stops someone removing the last
--    role that can manage roles and locking the whole team out.
INSERT INTO `Role` (`name`, `description`, `isSystem`, `updatedAt`)
VALUES ('Super Admin', 'Full, unrestricted access to every module and action.', true, CURRENT_TIMESTAMP(3));

SET @superRoleId = LAST_INSERT_ID();

-- 6. Backfill: everyone who is an ADMIN today becomes a super admin, so the
--    people currently running the panel keep working the moment this deploys.
--    Non-admins get the same role pointer but NOT the flag — they are then
--    narrowed down from the Roles screen.
UPDATE `User`
   SET `roleId` = @superRoleId,
       `isSuperAdmin` = true
 WHERE `role` = 'ADMIN' AND `isDeleted` = false;
