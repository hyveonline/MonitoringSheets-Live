-- Glass and Plastic Inspection Checklist Schema
-- Creates tables for settings, locations, items, and documents

-- Settings table for document metadata
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GPI_Settings' AND xtype='U')
BEGIN
    CREATE TABLE GPI_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(50) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert default settings
    INSERT INTO GPI_Settings (setting_key, setting_value) VALUES 
        ('creation_date', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('last_revision', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('edition', '1.0'),
        ('reference', 'GMRL-GPI-001');
END

-- Locations table for predefined inspection locations
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GPI_Locations' AND xtype='U')
BEGIN
    CREATE TABLE GPI_Locations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        location_name NVARCHAR(100) NOT NULL,
        location_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert sample locations
    INSERT INTO GPI_Locations (location_name, location_code) VALUES 
        ('Kitchen', 'KIT'),
        ('Storage Room', 'STR'),
        ('Preparation Area', 'PREP'),
        ('Packaging Area', 'PKG'),
        ('Cold Room', 'COLD');
END

-- Items table for glass/plastic items (related to locations)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GPI_Items' AND xtype='U')
BEGIN
    CREATE TABLE GPI_Items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        location_id INT NOT NULL,
        item_name NVARCHAR(100) NOT NULL,
        item_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (location_id) REFERENCES GPI_Locations(id)
    );
    
    -- Insert sample items for each location
    INSERT INTO GPI_Items (location_id, item_name, item_code) VALUES 
        (1, 'Light Covers', 'LC-KIT'),
        (1, 'Window Panes', 'WP-KIT'),
        (1, 'Plastic Containers', 'PC-KIT'),
        (2, 'Storage Bins', 'SB-STR'),
        (2, 'Shelving Covers', 'SC-STR'),
        (3, 'Cutting Board Covers', 'CBC-PREP'),
        (3, 'Measuring Cups', 'MC-PREP'),
        (4, 'Packaging Film Holders', 'PFH-PKG'),
        (5, 'Cold Room Windows', 'CRW-COLD'),
        (5, 'Plastic Curtains', 'PCT-COLD');
END

-- Documents table for inspection records
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='GPI_Documents' AND xtype='U')
BEGIN
    CREATE TABLE GPI_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filled_by NVARCHAR(100) NOT NULL,
        document_date DATE NOT NULL,
        location_id INT NOT NULL,
        item_id INT NOT NULL,
        condition_good BIT,
        corrective_action NVARCHAR(MAX),
        comments NVARCHAR(MAX),
        branch_id INT,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (location_id) REFERENCES GPI_Locations(id),
        FOREIGN KEY (item_id) REFERENCES GPI_Items(id)
    );
END

-- Add indexes for faster queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GPI_Documents_Date')
BEGIN
    CREATE INDEX IX_GPI_Documents_Date ON GPI_Documents(document_date DESC);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GPI_Documents_Location')
BEGIN
    CREATE INDEX IX_GPI_Documents_Location ON GPI_Documents(location_id);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GPI_Items_Location')
BEGIN
    CREATE INDEX IX_GPI_Items_Location ON GPI_Items(location_id);
END
