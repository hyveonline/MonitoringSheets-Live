-- Pasteurized Juices Checklist Schema
-- Track pasteurized juices quality control

USE FSMonitoringDB;
GO

-- Pasteurized Juices Settings Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PJC_Settings' AND xtype='U')
BEGIN
    CREATE TABLE PJC_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(100) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert default settings
    INSERT INTO PJC_Settings (setting_key, setting_value) VALUES
    ('creation_date', '2026-03-27'),
    ('last_revision', '2026-03-27'),
    ('edition', '1.0'),
    ('reference', 'GMRL-PJC-001'),
    ('dashboard_icon', 'clipboard-check');
END
GO

-- Products Table (for dropdown selection)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PJC_Products' AND xtype='U')
BEGIN
    CREATE TABLE PJC_Products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        product_name NVARCHAR(200) NOT NULL,
        product_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert sample products
    INSERT INTO PJC_Products (product_name, product_code, sort_order) VALUES
    ('Orange Juice', 'OJ001', 1),
    ('Apple Juice', 'AJ001', 2),
    ('Strawberry Juice', 'SJ001', 3),
    ('Strawberry Banana Juice', 'SBJ001', 4),
    ('Mixed Fruit Juice', 'MFJ001', 5);
END
GO

-- Pasteurized Juices Checklist Documents
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PJC_Documents' AND xtype='U')
BEGIN
    CREATE TABLE PJC_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_number NVARCHAR(50) NOT NULL UNIQUE,
        filled_by NVARCHAR(100) NOT NULL,
        
        -- Basic Info
        date_of_preparation DATE NOT NULL,
        product_id INT NOT NULL,
        product_name NVARCHAR(200) NOT NULL,
        
        -- Fruit Preparation Section
        fruits_correctly_sorted BIT DEFAULT NULL,
        fruits_correctly_sorted_action NVARCHAR(500) NULL,
        fruits_properly_disinfected BIT DEFAULT NULL,
        fruits_properly_disinfected_action NVARCHAR(500) NULL,
        proper_strainers_used BIT DEFAULT NULL,
        proper_strainers_used_action NVARCHAR(500) NULL,
        strainers_good_condition BIT DEFAULT NULL,
        strainers_good_condition_action NVARCHAR(500) NULL,
        juice_properly_strained BIT DEFAULT NULL,
        juice_properly_strained_action NVARCHAR(500) NULL,
        quality_before_pasteurization BIT DEFAULT NULL,
        quality_before_pasteurization_action NVARCHAR(500) NULL,
        
        -- Thermobuttons & Vacuum Section
        thermobuttons_good_condition BIT DEFAULT NULL,
        thermobuttons_good_condition_action NVARCHAR(500) NULL,
        vacuum_done_properly BIT DEFAULT NULL,
        vacuum_done_properly_action NVARCHAR(500) NULL,
        vacuum_prog NVARCHAR(50) DEFAULT '10',
        vacuum_percent NVARCHAR(50) DEFAULT '20%',
        vacuum_sealing_time NVARCHAR(50) DEFAULT '3 sec',
        vacuum_pressure NVARCHAR(50) DEFAULT '-1 bar',
        
        -- Pasteurization Section
        date_of_pasteurization DATE NULL,
        oven_steam_mode BIT DEFAULT NULL,
        oven_steam_mode_action NVARCHAR(500) NULL,
        
        -- Heat Treatment Duration
        heat_start_time TIME NULL,
        heat_finish_time TIME NULL,
        
        -- Cooling Section
        cooling_start_time TIME NULL,
        cooling_finish_time TIME NULL,
        
        -- Pasteurization Verification
        pasteurization_proper BIT DEFAULT NULL,
        pasteurization_proper_action NVARCHAR(500) NULL,
        
        -- Temperature After Cooling
        temp_after_cooling_ok BIT DEFAULT NULL,
        temp_after_cooling_value DECIMAL(5,2) NULL,
        
        -- Final Quality Checks
        quality_after_pasteurization BIT DEFAULT NULL,
        quality_after_pasteurization_action NVARCHAR(500) NULL,
        expiry_date_correct BIT DEFAULT NULL,
        expiry_date_correct_action NVARCHAR(500) NULL,
        labelling_correct BIT DEFAULT NULL,
        labelling_correct_action NVARCHAR(500) NULL,
        retention_sample_taken BIT DEFAULT NULL,
        retention_sample_taken_action NVARCHAR(500) NULL,
        
        -- Comments
        comments NVARCHAR(2000) NULL,
        
        -- Status fields
        status NVARCHAR(20) DEFAULT 'Active',
        is_verified BIT DEFAULT 0,
        verified_by NVARCHAR(100) NULL,
        verified_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        
        FOREIGN KEY (product_id) REFERENCES PJC_Products(id)
    );

    CREATE INDEX IX_PJC_Documents_PrepDate ON PJC_Documents(date_of_preparation);
    CREATE INDEX IX_PJC_Documents_PastDate ON PJC_Documents(date_of_pasteurization);
END
GO
