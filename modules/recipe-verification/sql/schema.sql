-- Recipe Verification Checklist Schema
-- Track recipe verification quality control

USE FSMonitoringDB;
GO

-- Recipe Items Master Table (predefined items with ingredients)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RV_RecipeItems' AND xtype='U')
BEGIN
    CREATE TABLE RV_RecipeItems (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_name NVARCHAR(200) NOT NULL,
        ingredients NVARCHAR(1000) NOT NULL,
        tasting_criteria NVARCHAR(500) NULL,
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert sample recipe items
    INSERT INTO RV_RecipeItems (item_name, ingredients, tasting_criteria) VALUES
    ('Tuna Sandwich', 'Brown Sandwich, Mayo Sriracha Sauce, Iceberg, Tuna Mix', 'Fresh taste, well-mixed filling, proper seasoning'),
    ('Chicken Caesar Salad', 'Romaine Lettuce, Grilled Chicken, Parmesan, Croutons, Caesar Dressing', 'Crisp lettuce, tender chicken, balanced dressing'),
    ('Beef Burger', 'Burger Bun, Beef Patty, Lettuce, Tomato, Onion, Pickles, Special Sauce', 'Juicy patty, fresh vegetables, proper seasoning');
END
GO

-- Recipe Verification Settings Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RV_Settings' AND xtype='U')
BEGIN
    CREATE TABLE RV_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(100) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert default settings
    INSERT INTO RV_Settings (setting_key, setting_value) VALUES
    ('creation_date', '2026-01-01'),
    ('last_revision', '2026-03-26'),
    ('edition', '1.0'),
    ('reference', 'GMRL-RV-001'),
    ('dashboard_icon', 'clipboard-check');
END
GO

-- Recipe Verification Documents (One per day or per session)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RV_Documents' AND xtype='U')
BEGIN
    CREATE TABLE RV_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_number NVARCHAR(50) NOT NULL UNIQUE,
        log_date DATE NOT NULL,
        filled_by NVARCHAR(100) NOT NULL,
        comments NVARCHAR(2000) NULL,
        status NVARCHAR(20) DEFAULT 'Active',
        is_verified BIT DEFAULT 0,
        verified_by NVARCHAR(100) NULL,
        verified_at DATETIME NULL,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    CREATE INDEX IX_RV_Documents_LogDate ON RV_Documents(log_date);
END
GO

-- Recipe Verification Entries (Each item entry in a document)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RV_Entries' AND xtype='U')
BEGIN
    CREATE TABLE RV_Entries (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_id INT NOT NULL,
        
        -- Item Info (from predefined list)
        recipe_item_id INT NOT NULL,
        item_name NVARCHAR(200) NOT NULL,
        ingredients NVARCHAR(1000) NOT NULL,
        
        -- Overall Quality of Ingredients (Yes/No fields)
        quality_freshness BIT DEFAULT NULL,
        quality_freshness_action NVARCHAR(500) NULL,
        quality_appearance BIT DEFAULT NULL,
        quality_appearance_action NVARCHAR(500) NULL,
        quality_color BIT DEFAULT NULL,
        quality_color_action NVARCHAR(500) NULL,
        quality_odor BIT DEFAULT NULL,
        quality_odor_action NVARCHAR(500) NULL,
        quality_cut_properly BIT DEFAULT NULL,
        quality_cut_properly_action NVARCHAR(500) NULL,
        
        -- Ingredients Weight/Quantity
        recipe_mop_weight NVARCHAR(200) NULL,
        onsite_verification_weight DECIMAL(10,2) NULL,
        
        -- Tasting
        tasting_criteria NVARCHAR(500) NULL,
        tasting_result NVARCHAR(500) NULL,
        
        -- Additional Checks (Yes/No with corrective actions)
        packaging_clean BIT DEFAULT NULL,
        packaging_clean_action NVARCHAR(500) NULL,
        correct_packaging BIT DEFAULT NULL,
        correct_packaging_action NVARCHAR(500) NULL,
        correct_shelf_life BIT DEFAULT NULL,
        correct_shelf_life_action NVARCHAR(500) NULL,
        retention_sample BIT DEFAULT NULL,
        retention_sample_action NVARCHAR(500) NULL,
        
        -- Status tracking
        overall_status NVARCHAR(20) DEFAULT 'Pending',
        
        -- Signature
        signature NVARCHAR(200) NULL,
        signature_timestamp DATETIME NULL,
        
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        
        FOREIGN KEY (document_id) REFERENCES RV_Documents(id) ON DELETE CASCADE,
        FOREIGN KEY (recipe_item_id) REFERENCES RV_RecipeItems(id)
    );

    CREATE INDEX IX_RV_Entries_DocumentId ON RV_Entries(document_id);
END
GO

PRINT 'Recipe Verification schema created successfully!';
GO
