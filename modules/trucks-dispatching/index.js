const express = require('express');
const router = express.Router();
const path = require('path');
const sql = require('mssql');

// Database configuration
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'Kokowawa123@@',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_NAME || 'FSMonitoringDB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Get database connection
async function getConnection() {
    try {
        const pool = await sql.connect(dbConfig);
        return pool;
    } catch (err) {
        console.error('Database connection error:', err);
        throw err;
    }
}

// ==========================================
// Page Routes
// ==========================================

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

router.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'history.html'));
});

router.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// ==========================================
// Settings API
// ==========================================

router.get('/api/settings', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT setting_key, setting_value FROM TDM_Settings');
        
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        res.json(settings);
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

router.put('/api/settings', async (req, res) => {
    try {
        const pool = await getConnection();
        const { creation_date, last_revision, edition, reference } = req.body;
        
        const updates = [
            { key: 'creation_date', value: creation_date },
            { key: 'last_revision', value: last_revision },
            { key: 'edition', value: edition },
            { key: 'reference', value: reference }
        ];
        
        for (const update of updates) {
            if (update.value !== undefined) {
                await pool.request()
                    .input('key', sql.NVarChar, update.key)
                    .input('value', sql.NVarChar, update.value)
                    .query(`
                        UPDATE TDM_Settings 
                        SET setting_value = @value, updated_at = GETDATE() 
                        WHERE setting_key = @key
                    `);
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// Trucks API
// ==========================================

router.get('/api/trucks', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT id, truck_number, truck_code, is_active 
            FROM TDM_Trucks 
            WHERE is_active = 1
            ORDER BY truck_number
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching trucks:', err);
        res.status(500).json({ error: 'Failed to fetch trucks' });
    }
});

router.post('/api/trucks', async (req, res) => {
    try {
        const pool = await getConnection();
        const { truck_number, truck_code } = req.body;
        
        const result = await pool.request()
            .input('truck_number', sql.NVarChar, truck_number)
            .input('truck_code', sql.NVarChar, truck_code || null)
            .query(`
                INSERT INTO TDM_Trucks (truck_number, truck_code)
                OUTPUT INSERTED.id
                VALUES (@truck_number, @truck_code)
            `);
        
        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        console.error('Error adding truck:', err);
        res.status(500).json({ error: 'Failed to add truck' });
    }
});

router.delete('/api/trucks/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE TDM_Trucks SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting truck:', err);
        res.status(500).json({ error: 'Failed to delete truck' });
    }
});

// ==========================================
// Documents API
// ==========================================

router.get('/api/documents', async (req, res) => {
    try {
        const pool = await getConnection();
        const { startDate, endDate, truck_id, branch_id } = req.query;
        
        let query = `
            SELECT d.*, t.truck_number, t.truck_code
            FROM TDM_Documents d
            LEFT JOIN TDM_Trucks t ON d.truck_id = t.id
            WHERE 1=1
        `;
        
        const request = pool.request();
        
        if (startDate) {
            query += ' AND d.document_date >= @startDate';
            request.input('startDate', sql.Date, startDate);
        }
        if (endDate) {
            query += ' AND d.document_date <= @endDate';
            request.input('endDate', sql.Date, endDate);
        }
        if (truck_id) {
            query += ' AND d.truck_id = @truck_id';
            request.input('truck_id', sql.Int, truck_id);
        }
        if (branch_id) {
            query += ' AND d.branch_id = @branch_id';
            request.input('branch_id', sql.Int, branch_id);
        }
        
        query += ' ORDER BY d.document_date DESC, d.created_at DESC';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.get('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT d.*, t.truck_number, t.truck_code
                FROM TDM_Documents d
                LEFT JOIN TDM_Trucks t ON d.truck_id = t.id
                WHERE d.id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

router.post('/api/documents', async (req, res) => {
    try {
        const pool = await getConnection();
        const {
            filled_by,
            document_date,
            truck_id,
            set_temperature,
            actual_temperature,
            truck_cleanliness,
            cleanliness_corrective_action,
            raw_rte_segregation,
            meat_chicken_segregation,
            products_arranged,
            comments,
            branch_id
        } = req.body;
        
        const result = await pool.request()
            .input('filled_by', sql.NVarChar, filled_by)
            .input('document_date', sql.Date, document_date)
            .input('truck_id', sql.Int, truck_id)
            .input('set_temperature', sql.Decimal(5, 2), set_temperature || null)
            .input('actual_temperature', sql.Decimal(5, 2), actual_temperature || null)
            .input('truck_cleanliness', sql.Bit, truck_cleanliness)
            .input('cleanliness_corrective_action', sql.NVarChar, cleanliness_corrective_action || null)
            .input('raw_rte_segregation', sql.Bit, raw_rte_segregation)
            .input('meat_chicken_segregation', sql.Bit, meat_chicken_segregation)
            .input('products_arranged', sql.Bit, products_arranged)
            .input('comments', sql.NVarChar, comments || null)
            .input('branch_id', sql.Int, branch_id || null)
            .query(`
                INSERT INTO TDM_Documents (
                    filled_by, document_date, truck_id, set_temperature, actual_temperature,
                    truck_cleanliness, cleanliness_corrective_action, raw_rte_segregation,
                    meat_chicken_segregation, products_arranged, comments, branch_id
                )
                OUTPUT INSERTED.id
                VALUES (
                    @filled_by, @document_date, @truck_id, @set_temperature, @actual_temperature,
                    @truck_cleanliness, @cleanliness_corrective_action, @raw_rte_segregation,
                    @meat_chicken_segregation, @products_arranged, @comments, @branch_id
                )
            `);
        
        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: 'Failed to create document' });
    }
});

router.put('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        const {
            filled_by,
            document_date,
            truck_id,
            set_temperature,
            actual_temperature,
            truck_cleanliness,
            cleanliness_corrective_action,
            raw_rte_segregation,
            meat_chicken_segregation,
            products_arranged,
            comments
        } = req.body;
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('document_date', sql.Date, document_date)
            .input('truck_id', sql.Int, truck_id)
            .input('set_temperature', sql.Decimal(5, 2), set_temperature || null)
            .input('actual_temperature', sql.Decimal(5, 2), actual_temperature || null)
            .input('truck_cleanliness', sql.Bit, truck_cleanliness)
            .input('cleanliness_corrective_action', sql.NVarChar, cleanliness_corrective_action || null)
            .input('raw_rte_segregation', sql.Bit, raw_rte_segregation)
            .input('meat_chicken_segregation', sql.Bit, meat_chicken_segregation)
            .input('products_arranged', sql.Bit, products_arranged)
            .input('comments', sql.NVarChar, comments || null)
            .query(`
                UPDATE TDM_Documents SET
                    filled_by = @filled_by,
                    document_date = @document_date,
                    truck_id = @truck_id,
                    set_temperature = @set_temperature,
                    actual_temperature = @actual_temperature,
                    truck_cleanliness = @truck_cleanliness,
                    cleanliness_corrective_action = @cleanliness_corrective_action,
                    raw_rte_segregation = @raw_rte_segregation,
                    meat_chicken_segregation = @meat_chicken_segregation,
                    products_arranged = @products_arranged,
                    comments = @comments,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json({ error: 'Failed to update document' });
    }
});

router.delete('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM TDM_Documents WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ==========================================
// Stats API
// ==========================================

router.get('/api/stats', async (req, res) => {
    try {
        const pool = await getConnection();
        const { branch_id } = req.query;
        
        let branchFilter = '';
        const request = pool.request();
        
        if (branch_id) {
            branchFilter = 'AND branch_id = @branch_id';
            request.input('branch_id', sql.Int, branch_id);
        }
        
        // Get today's records count
        const todayResult = await request.query(`
            SELECT COUNT(*) as count FROM TDM_Documents 
            WHERE CAST(document_date AS DATE) = CAST(GETDATE() AS DATE) ${branchFilter}
        `);
        
        // Get this month's records count
        const monthResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM TDM_Documents 
                WHERE MONTH(document_date) = MONTH(GETDATE()) 
                AND YEAR(document_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        // Get total trucks
        const trucksResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM TDM_Trucks WHERE is_active = 1');
        
        // Get cleanliness issues count (this month)
        const issuesResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM TDM_Documents 
                WHERE truck_cleanliness = 0
                AND MONTH(document_date) = MONTH(GETDATE()) 
                AND YEAR(document_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        res.json({
            todayRecords: todayResult.recordset[0].count,
            monthRecords: monthResult.recordset[0].count,
            totalTrucks: trucksResult.recordset[0].count,
            cleanlinessIssues: issuesResult.recordset[0].count
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Verification endpoint
router.get('/api/verify/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT d.*, t.truck_number, t.truck_code
                FROM TDM_Documents d
                LEFT JOIN TDM_Trucks t ON d.truck_id = t.id
                WHERE d.id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Record not found', valid: false });
        }
        
        res.json({ valid: true, data: result.recordset[0] });
    } catch (err) {
        console.error('Error verifying document:', err);
        res.status(500).json({ error: 'Verification failed', valid: false });
    }
});

module.exports = router;
