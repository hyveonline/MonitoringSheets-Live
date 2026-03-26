-- Trucks Dispatching Monitoring Sheet Schema
-- Creates tables for settings, trucks, and documents

-- Settings table for document metadata
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TDM_Settings' AND xtype='U')
BEGIN
    CREATE TABLE TDM_Settings (
        id INT IDENTITY(1,1) PRIMARY KEY,
        setting_key NVARCHAR(50) NOT NULL UNIQUE,
        setting_value NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert default settings
    INSERT INTO TDM_Settings (setting_key, setting_value) VALUES 
        ('creation_date', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('last_revision', CONVERT(VARCHAR(10), GETDATE(), 120)),
        ('edition', '1.0'),
        ('reference', 'GMRL-TDM-001');
END

-- Trucks table for predefined truck numbers
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TDM_Trucks' AND xtype='U')
BEGIN
    CREATE TABLE TDM_Trucks (
        id INT IDENTITY(1,1) PRIMARY KEY,
        truck_number NVARCHAR(50) NOT NULL,
        truck_code NVARCHAR(50),
        is_active BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
    );
    
    -- Insert sample trucks
    INSERT INTO TDM_Trucks (truck_number, truck_code) VALUES 
        ('Truck 001', 'TRK-001'),
        ('Truck 002', 'TRK-002'),
        ('Truck 003', 'TRK-003'),
        ('Truck 004', 'TRK-004'),
        ('Truck 005', 'TRK-005');
END

-- Documents table for monitoring records
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TDM_Documents' AND xtype='U')
BEGIN
    CREATE TABLE TDM_Documents (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filled_by NVARCHAR(100) NOT NULL,
        document_date DATE NOT NULL,
        truck_id INT NOT NULL,
        set_temperature DECIMAL(5,2),
        actual_temperature DECIMAL(5,2),
        truck_cleanliness BIT,
        cleanliness_corrective_action NVARCHAR(MAX),
        raw_rte_segregation BIT,
        meat_chicken_segregation BIT,
        products_arranged BIT,
        comments NVARCHAR(MAX),
        branch_id INT,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (truck_id) REFERENCES TDM_Trucks(id)
    );
END

-- Add index for faster queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TDM_Documents_Date')
BEGIN
    CREATE INDEX IX_TDM_Documents_Date ON TDM_Documents(document_date DESC);
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TDM_Documents_Truck')
BEGIN
    CREATE INDEX IX_TDM_Documents_Truck ON TDM_Documents(truck_id);
END
