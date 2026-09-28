-- 018: sub-module permissions + credit amounts (2026-09-28). Data only.
-- Each role keeps exactly what it could do before: a sub-permission is granted
-- wherever its parent was held, in role grants and in per-user overrides
-- (an override keeps its ALLOW/DENY).

-- projects.view → projectProducts.view, projectTeam.view, projectCommission.view
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'projectProducts.view' AS p UNION ALL SELECT 'projectTeam.view' UNION ALL SELECT 'projectCommission.view') s
  WHERE rp.`permission` = 'projects.view';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'projectProducts.view' AS p UNION ALL SELECT 'projectTeam.view' UNION ALL SELECT 'projectCommission.view') s
  WHERE up.`permission` = 'projects.view';

-- projects.update → projectProducts.create, projectProducts.update, projectProducts.delete, projectTeam.update, projectCommission.update
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'projectProducts.create' AS p UNION ALL SELECT 'projectProducts.update' UNION ALL SELECT 'projectProducts.delete' UNION ALL SELECT 'projectTeam.update' UNION ALL SELECT 'projectCommission.update') s
  WHERE rp.`permission` = 'projects.update';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'projectProducts.create' AS p UNION ALL SELECT 'projectProducts.update' UNION ALL SELECT 'projectProducts.delete' UNION ALL SELECT 'projectTeam.update' UNION ALL SELECT 'projectCommission.update') s
  WHERE up.`permission` = 'projects.update';

-- clients.view → clientKyc.view, clientTeam.view, clientCredit.view
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'clientKyc.view' AS p UNION ALL SELECT 'clientTeam.view' UNION ALL SELECT 'clientCredit.view') s
  WHERE rp.`permission` = 'clients.view';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'clientKyc.view' AS p UNION ALL SELECT 'clientTeam.view' UNION ALL SELECT 'clientCredit.view') s
  WHERE up.`permission` = 'clients.view';

-- clients.update → clientKyc.create, clientKyc.delete, clientTeam.create, clientTeam.update, clientTeam.delete, clientCredit.update
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'clientKyc.create' AS p UNION ALL SELECT 'clientKyc.delete' UNION ALL SELECT 'clientTeam.create' UNION ALL SELECT 'clientTeam.update' UNION ALL SELECT 'clientTeam.delete' UNION ALL SELECT 'clientCredit.update') s
  WHERE rp.`permission` = 'clients.update';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'clientKyc.create' AS p UNION ALL SELECT 'clientKyc.delete' UNION ALL SELECT 'clientTeam.create' UNION ALL SELECT 'clientTeam.update' UNION ALL SELECT 'clientTeam.delete' UNION ALL SELECT 'clientCredit.update') s
  WHERE up.`permission` = 'clients.update';

-- vendors.view → vendorPlants.view
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'vendorPlants.view' AS p) s
  WHERE rp.`permission` = 'vendors.view';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'vendorPlants.view' AS p) s
  WHERE up.`permission` = 'vendors.view';

-- vendors.update → vendorPlants.create, vendorPlants.update, vendorPlants.delete
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'vendorPlants.create' AS p UNION ALL SELECT 'vendorPlants.update' UNION ALL SELECT 'vendorPlants.delete') s
  WHERE rp.`permission` = 'vendors.update';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'vendorPlants.create' AS p UNION ALL SELECT 'vendorPlants.update' UNION ALL SELECT 'vendorPlants.delete') s
  WHERE up.`permission` = 'vendors.update';

-- payments.view → creditAmounts.view
INSERT IGNORE INTO `RolePermission` (`roleId`, `permission`)
  SELECT rp.`roleId`, s.p FROM `RolePermission` rp JOIN (SELECT 'creditAmounts.view' AS p) s
  WHERE rp.`permission` = 'payments.view';
INSERT IGNORE INTO `UserPermission` (`userId`, `permission`, `effect`)
  SELECT up.`userId`, s.p, up.`effect` FROM `UserPermission` up JOIN (SELECT 'creditAmounts.view' AS p) s
  WHERE up.`permission` = 'payments.view';
