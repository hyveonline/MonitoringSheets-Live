-- Pest Activity Sighting Schema
-- Creates tables for settings and pest sighting documents

-- Settings table for document metadata
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PAS_Settings' AND xtype='U')
BEGIN
    CREATE TABLE PAS_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(50) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert default settings
    INSERT INTO PAS_Settings (setting_key, setting_value) VALUES 
        ('creation_date', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('last_revision', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('edition', '1.0'),
        ('reference', 'GMRL-PAS-001');
END

-- Pest Types table for predefined pest types
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PAS_PestTypes' AND xtype='U')
BEGIN
    CREATE TABLE PAS_PestTypes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        pest_type_en NVARCHAR(100) NOT NULL,
        pest_type_ar NVARCHAR(100),
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert sample pest types
    INSERT INTO PAS_PestTypes (pest_type_en, pest_type_ar) VALUES 
        ('Cockroach', N'صرصور'),
        ('Rodent', N'قوارض'),
        ('Fly', N'ذباب'),
        ('Ant', N'نمل'),
        ('Bird', N'طيور'),
        ('Other', N'أخرى');
END

-- Locations table for predefined locations
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PAS_Locations' AND xtype='U')
BEGIN
    CREATE TABLE PAS_Locations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        location_en NVARCHAR(100) NOT NULL,
        location_ar NVARCHAR(100),
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert sample locations
    INSERT INTO PAS_Locations (location_en, location_ar) VALUES 
        ('Kitchen', N'المطبخ'),
        ('Storage Room', N'غرفة التخزين'),
        ('Receiving Area', N'منطقة الاستلام'),
        ('Dining Area', N'منطقة تناول الطعام'),
        ('Waste Area', N'منطقة النفايات'),
        ('Office', N'المكتب');
END

-- Documents table for pest sighting records
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PAS_Documents' AND xtype='U')
BEGIN
    CREATE TABLE PAS_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        -- Pest Evidence Section
        sighting_date DATE NOT NULL,
        sighting_time TIME,
        location_id INT,
        pest_type_id INT,
        pest_number INT,
        reported_by NVARCHAR(100) NOT NULL,
        date_reported DATE,
        contractor_notified BIT,
        -- Action Taken Section
        action_taken NVARCHAR(MAX),
        action_by_whom NVARCHAR(100),
        action_results NVARCHAR(MAX),
        follow_up_remarks NVARCHAR(MAX),
        -- Metadata
        branch_id INT,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (location_id) REFERENCES PAS_Locations(id),
        FOREIGN KEY (pest_type_id) REFERENCES PAS_PestTypes(id)
    );
END

-- Add indexes for faster queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PAS_Documents_Date')
BEGIN
    CREATE INDEX IX_PAS_Documents_Date ON PAS_Documents(sighting_date DESC);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PAS_Documents_Location')
BEGIN
    CREATE INDEX IX_PAS_Documents_Location ON PAS_Documents(location_id);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PAS_Documents_PestType')
BEGIN
    CREATE INDEX IX_PAS_Documents_PestType ON PAS_Documents(pest_type_id);
END
