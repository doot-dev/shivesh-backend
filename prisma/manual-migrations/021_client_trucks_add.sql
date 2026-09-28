-- 021: client contacts can add trucks with their challan (2026-09-29). Data only.
-- Site Engineer gets trucks.add (the Owner holds every permission already).
INSERT IGNORE INTO `ClientRolePermission` (`roleId`, `permission`)
  SELECT `id`, 'trucks.add' FROM `ClientRole` WHERE `name` = 'Site Engineer' AND `isDeleted` = false;
