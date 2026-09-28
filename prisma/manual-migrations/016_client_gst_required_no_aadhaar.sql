-- 016: every client has a GSTIN; the owner's Aadhaar number is removed (2026-09-28).
-- Irreversible: take a backup first. Aadhaar KYC files (KYCDocument.type = 'aadhaar')
-- are NOT touched here.
ALTER TABLE `Client` DROP COLUMN `ownerAadhaar`;
