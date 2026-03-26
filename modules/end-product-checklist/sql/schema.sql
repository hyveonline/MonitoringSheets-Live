-- End-Product Checklist Schema
-- Track end product quality control

USE FSMonitoringDB;
GO

-- End Product Checklist Settings Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EPC_Settings' AND xtype='U')
BEGIN
    CREATE TABLE EPC_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(100) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert default settings
    INSERT INTO EPC_Settings (setting_key, setting_value) VALUES
    ('creation_date', '2026-03-26'),
    ('last_revision', '2026-03-26'),
    ('edition', '1.0'),
    ('reference', 'GMRL-EPC-001'),
    ('dashboard_icon', 'clipboard-check');
END
GO

-- Branches Table (for dropdown selection)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EPC_Branches' AND xtype='U')
BEGIN
    CREATE TABLE EPC_Branches (
        id INT IDENTITY(1,1) PRIMARY KEY,
        branch_name NVARCHAR(200) NOT NULL,
        branch_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert sample branches
    INSERT INTO EPC_Branches (branch_name, branch_code, sort_order) VALUES
    ('Main Kitchen', 'MK001', 1),
    ('Branch 1', 'BR001', 2),
    ('Branch 2', 'BR002', 3);
END
GO

-- Products Table (for dropdown selection)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EPC_Products' AND xtype='U')
BEGIN
    CREATE TABLE EPC_Products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_name NVARCHAR(200) NOT NULL,
        product_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert sample products
    INSERT INTO EPC_Products (product_name, product_code, sort_order) VALUES
    ('Chicken Sandwich', 'CS001', 1),
    ('Beef Burger', 'BB001', 2),
    ('Caesar Salad', 'SAL001', 3);
END
GO

-- End Product Checklist Documents (One per entry)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EPC_Documents' AND xtype='U')
BEGIN
    CREATE TABLE EPC_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_number NVARCHAR(50) NOT NULL UNIQUE,
        log_date DATE NOT NULL,
        filled_by NVARCHAR(100) NOT NULL,
        branch_id INT NOT NULL,
        branch_name NVARCHAR(200) NOT NULL,
        product_text NVARCHAR(500) NOT NULL,
        comments NVARCHAR(2000) NULL,
        
        -- Raw Material Section
        raw_appearance_good BIT DEFAULT NULL,
        raw_appearance_action NVARCHAR(500) NULL,
        raw_temperature_ok BIT DEFAULT NULL,
        raw_temperature_action NVARCHAR(500) NULL,
        raw_production_date DATE NULL,
        raw_expiry_date DATE NULL,
        
        -- Visual Inspection Section
        visual_work_area_clean BIT DEFAULT NULL,
        visual_work_area_action NVARCHAR(500) NULL,
        visual_food_handling BIT DEFAULT NULL,
        visual_food_handling_action NVARCHAR(500) NULL,
        visual_ingredients_appearance BIT DEFAULT NULL,
        visual_ingredients_action NVARCHAR(500) NULL,
        
        -- Food Lose Section
        food_correct_weight BIT DEFAULT NULL,
        food_correct_weight_action NVARCHAR(500) NULL,
        food_cutleries_present BIT DEFAULT NULL,
        food_cutleries_action NVARCHAR(500) NULL,
        
        -- Packaging Section
        pkg_correct_packaging BIT DEFAULT NULL,
        pkg_correct_packaging_action NVARCHAR(500) NULL,
        pkg_clean BIT DEFAULT NULL,
        pkg_clean_action NVARCHAR(500) NULL,
        pkg_correct_label BIT DEFAULT NULL,
        pkg_correct_label_action NVARCHAR(500) NULL,
        pkg_correct_shelf_life BIT DEFAULT NULL,
        pkg_correct_shelf_life_action NVARCHAR(500) NULL,
        pkg_sealed_properly BIT DEFAULT NULL,
        pkg_sealed_properly_action NVARCHAR(500) NULL,
        
        -- End Product Section
        end_overall_presentation BIT DEFAULT NULL,
        end_overall_presentation_action NVARCHAR(500) NULL,
        end_tasting BIT DEFAULT NULL,
        end_tasting_action NVARCHAR(500) NULL,
        
        -- Retention Section
        retention_taken BIT DEFAULT 0,
        
        -- Status fields
        status NVARCHAR(20) DEFAULT 'Active',
        is_verified BIT DEFAULT 0,
        verified_by NVARCHAR(100) NULL,
        verified_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        
        FOREIGN KEY (branch_id) REFERENCES EPC_Branches(id)
    );

    CREATE INDEX IX_EPC_Documents_LogDate ON EPC_Documents(log_date);
    CREATE INDEX IX_EPC_Documents_Branch ON EPC_Documents(branch_id);
END
GO

-- Stored procedure to generate document number
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'EPC_GenerateDocNumber')
    DROP PROCEDURE EPC_GenerateDocNumber;
GO

CREATE PROCEDURE EPC_GenerateDocNumber
    @log_date DATE,
    @doc_number NVARCHAR(50) OUTPUT
AS
BEGIN
    DECLARE @prefix NVARCHAR(20);
    DECLARE @seq INT;
    
    SET @prefix = 'EPC-' + CONVERT(VARCHAR(8), @log_date, 112) + '-';
    
    SELECT @seq = ISNULL(MAX(CAST(RIGHT(document_number, 3) AS INT)), 0) + 1
    FROM EPC_Documents
    WHERE document_number LIKE @prefix + '%';
    
    SET @doc_number = @prefix + RIGHT('000' + CAST(@seq AS VARCHAR(3)), 3);
END
GO
