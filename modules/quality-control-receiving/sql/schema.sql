-- Quality Control Receiving Checklist Schema
-- Form 13: Track product receiving and storage quality control

USE FSMonitoringDB_UAT;
GO

-- Suppliers Master Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QCR_Suppliers' AND xtype='U')
BEGIN
    CREATE TABLE QCR_Suppliers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        supplier_name NVARCHAR(200) NOT NULL,
        contact_info NVARCHAR(500) NULL,
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert sample suppliers
    INSERT INTO QCR_Suppliers (supplier_name) VALUES
    ('Fresh Foods Ltd'),
    ('Quality Meats Co'),
    ('Dairy Direct'),
    ('Seafood Suppliers'),
    ('Bakery Wholesale'),
    ('Frozen Foods Inc'),
    ('Produce Partners'),
    ('General Provisions');
END
GO

-- Food Categories Master Table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QCR_FoodCategories' AND xtype='U')
BEGIN
    CREATE TABLE QCR_FoodCategories (
        id INT IDENTITY(1,1) PRIMARY KEY,
        category_name NVARCHAR(200) NOT NULL,
        min_temp DECIMAL(5,2) NULL,
        max_temp DECIMAL(5,2) NULL,
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );

    -- Insert default food categories with temperature ranges
    INSERT INTO QCR_FoodCategories (category_name, min_temp, max_temp) VALUES
    ('Fresh Meat', 0, 4),
    ('Fresh Poultry', 0, 4),
    ('Fresh Fish/Seafood', 0, 2),
    ('Dairy Products', 0, 5),
    ('Chilled Products', 0, 5),
    ('Fresh Vegetables', 1, 7),
    ('Frozen Products', -25, -18),
    ('Ambient/Dry Goods', NULL, NULL);
END
GO

-- Quality Control Receiving Documents (One per day)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QCR_Documents' AND xtype='U')
BEGIN
    CREATE TABLE QCR_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_number NVARCHAR(50) NOT NULL UNIQUE,
        log_date DATE NOT NULL,
        filled_by NVARCHAR(100) NOT NULL,
        status NVARCHAR(20) DEFAULT 'Active',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
END
GO

-- Quality Control Receiving Entries (Each product entry)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='QCR_Entries' AND xtype='U')
BEGIN
    CREATE TABLE QCR_Entries (
        id INT IDENTITY(1,1) PRIMARY KEY,
        document_id INT NOT NULL,
        
        -- Product Info
        product_name NVARCHAR(200) NOT NULL,
        product_expiry_date DATE NULL,
        supplier_id INT NULL,
        supplier_name NVARCHAR(200) NULL,
        
        -- Receiving Info
        receiving_time TIME NOT NULL,
        receiving_temp DECIMAL(5,2) NULL,
        receiving_area_clean BIT DEFAULT 0,
        product_well_covered BIT DEFAULT 0,
        pack_opened_inspected BIT DEFAULT 0,
        no_physical_hazards BIT DEFAULT 0,
        
        -- Transfer to Storage Info
        storage_time TIME NULL,
        storage_product_temp DECIMAL(5,2) NULL,
        chiller_freezer_temp DECIMAL(5,2) NULL,
        properly_stored BIT DEFAULT 0,
        
        -- Calculated/Other
        duration_minutes INT NULL,
        
        -- Comments and Corrective Action
        comments NVARCHAR(1000) NULL,
        corrective_action NVARCHAR(1000) NULL,
        
        -- Signature
        quality_controller_signature NVARCHAR(200) NULL,
        signature_timestamp DATETIME NULL,
        
        -- Status tracking
        overall_status NVARCHAR(20) DEFAULT 'Pending',
        
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        
        FOREIGN KEY (document_id) REFERENCES QCR_Documents(id),
        FOREIGN KEY (supplier_id) REFERENCES QCR_Suppliers(id)
    );
END
GO

-- Add production_date column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('QCR_Entries') AND name = 'production_date')
BEGIN
    ALTER TABLE QCR_Entries ADD production_date DATE NULL;
    PRINT 'Added production_date column to QCR_Entries';
END
GO

-- Add truck_cleanliness column if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('QCR_Entries') AND name = 'truck_cleanliness')
BEGIN
    ALTER TABLE QCR_Entries ADD truck_cleanliness BIT DEFAULT 0;
    PRINT 'Added truck_cleanliness column to QCR_Entries';
END
GO

-- Create indexes for better performance
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QCR_Documents_LogDate')
BEGIN
    CREATE INDEX IX_QCR_Documents_LogDate ON QCR_Documents(log_date);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QCR_Entries_DocumentId')
BEGIN
    CREATE INDEX IX_QCR_Entries_DocumentId ON QCR_Entries(document_id);
END
GO

PRINT 'Quality Control Receiving Checklist schema (Form 13) created successfully';
