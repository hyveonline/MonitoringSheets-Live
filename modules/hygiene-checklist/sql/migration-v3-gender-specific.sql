-- =====================================================
-- Hygiene Checklist Module - Migration v3
-- Feature: Gender-specific checklist items
-- Items like "Well Shaved" should be N/A for females
-- =====================================================

-- =====================================================
-- 1. Add gender_specific column to HygieneChecklistItems
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('HygieneChecklistItems') AND name = 'gender_specific')
BEGIN
    ALTER TABLE HygieneChecklistItems ADD gender_specific NVARCHAR(10) NULL;
    PRINT 'Added gender_specific column to HygieneChecklistItems';
END
ELSE
BEGIN
    PRINT 'gender_specific column already exists';
END
GO

-- =====================================================
-- 2. Set "Well Shaved" as male-only item
-- =====================================================
UPDATE HygieneChecklistItems 
SET gender_specific = 'Male'
WHERE name LIKE '%Well Shaved%' OR name LIKE '%Shaved%';

PRINT 'Updated Well Shaved item to be male-only';
GO

-- =====================================================
-- Migration Complete
-- =====================================================
PRINT '';
PRINT '=====================================================';
PRINT 'Migration v3 (Gender-specific items) completed!';
PRINT 'Items marked as gender_specific will show N/A for';
PRINT 'employees of the opposite gender.';
PRINT '=====================================================';
GO
