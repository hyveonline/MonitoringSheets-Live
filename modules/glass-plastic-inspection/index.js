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
        const result = await pool.request().query('SELECT setting_key, setting_value FROM GPI_Settings');
        
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
                        UPDATE GPI_Settings 
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
// Locations API
// ==========================================

router.get('/api/locations', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT id, location_name, location_code, is_active 
            FROM GPI_Locations 
            WHERE is_active = 1
            ORDER BY location_name
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching locations:', err);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

router.post('/api/locations', async (req, res) => {
    try {
        const pool = await getConnection();
        const { location_name, location_code } = req.body;
        
        const result = await pool.request()
            .input('location_name', sql.NVarChar, location_name)
            .input('location_code', sql.NVarChar, location_code || null)
            .query(`
                INSERT INTO GPI_Locations (location_name, location_code)
                OUTPUT INSERTED.id
                VALUES (@location_name, @location_code)
            `);
        
        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        console.error('Error adding location:', err);
        res.status(500).json({ error: 'Failed to add location' });
    }
});

router.delete('/api/locations/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE GPI_Locations SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting location:', err);
        res.status(500).json({ error: 'Failed to delete location' });
    }
});

// ==========================================
// Items API (Related to Locations)
// ==========================================

router.get('/api/items', async (req, res) => {
    try {
        const pool = await getConnection();
        const { location_id } = req.query;
        
        let query = `
            SELECT i.id, i.location_id, i.item_name, i.item_code, i.is_active,
                   l.location_name
            FROM GPI_Items i
            LEFT JOIN GPI_Locations l ON i.location_id = l.id
            WHERE i.is_active = 1
        `;
        
        const request = pool.request();
        
        if (location_id) {
            query += ' AND i.location_id = @location_id';
            request.input('location_id', sql.Int, location_id);
        }
        
        query += ' ORDER BY l.location_name, i.item_name';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching items:', err);
        res.status(500).json({ error: 'Failed to fetch items' });
    }
});

router.post('/api/items', async (req, res) => {
    try {
        const pool = await getConnection();
        const { location_id, item_name, item_code } = req.body;
        
        const result = await pool.request()
            .input('location_id', sql.Int, location_id)
            .input('item_name', sql.NVarChar, item_name)
            .input('item_code', sql.NVarChar, item_code || null)
            .query(`
                INSERT INTO GPI_Items (location_id, item_name, item_code)
                OUTPUT INSERTED.id
                VALUES (@location_id, @item_name, @item_code)
            `);
        
        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        console.error('Error adding item:', err);
        res.status(500).json({ error: 'Failed to add item' });
    }
});

router.delete('/api/items/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE GPI_Items SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting item:', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// ==========================================
// Documents API
// ==========================================

router.get('/api/documents', async (req, res) => {
    try {
        const pool = await getConnection();
        const { startDate, endDate, location_id, branch_id } = req.query;
        
        let query = `
            SELECT d.*, l.location_name, l.location_code, i.item_name, i.item_code
            FROM GPI_Documents d
            LEFT JOIN GPI_Locations l ON d.location_id = l.id
            LEFT JOIN GPI_Items i ON d.item_id = i.id
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
        if (location_id) {
            query += ' AND d.location_id = @location_id';
            request.input('location_id', sql.Int, location_id);
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
                SELECT d.*, l.location_name, l.location_code, i.item_name, i.item_code
                FROM GPI_Documents d
                LEFT JOIN GPI_Locations l ON d.location_id = l.id
                LEFT JOIN GPI_Items i ON d.item_id = i.id
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
            location_id,
            item_id,
            condition_good,
            corrective_action,
            comments,
            branch_id
        } = req.body;
        
        const result = await pool.request()
            .input('filled_by', sql.NVarChar, filled_by)
            .input('document_date', sql.Date, document_date)
            .input('location_id', sql.Int, location_id)
            .input('item_id', sql.Int, item_id)
            .input('condition_good', sql.Bit, condition_good)
            .input('corrective_action', sql.NVarChar, corrective_action || null)
            .input('comments', sql.NVarChar, comments || null)
            .input('branch_id', sql.Int, branch_id || null)
            .query(`
                INSERT INTO GPI_Documents (
                    filled_by, document_date, location_id, item_id,
                    condition_good, corrective_action, comments, branch_id
                )
                OUTPUT INSERTED.id
                VALUES (
                    @filled_by, @document_date, @location_id, @item_id,
                    @condition_good, @corrective_action, @comments, @branch_id
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
            location_id,
            item_id,
            condition_good,
            corrective_action,
            comments
        } = req.body;
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('document_date', sql.Date, document_date)
            .input('location_id', sql.Int, location_id)
            .input('item_id', sql.Int, item_id)
            .input('condition_good', sql.Bit, condition_good)
            .input('corrective_action', sql.NVarChar, corrective_action || null)
            .input('comments', sql.NVarChar, comments || null)
            .query(`
                UPDATE GPI_Documents SET
                    filled_by = @filled_by,
                    document_date = @document_date,
                    location_id = @location_id,
                    item_id = @item_id,
                    condition_good = @condition_good,
                    corrective_action = @corrective_action,
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
            .query('DELETE FROM GPI_Documents WHERE id = @id');
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
            SELECT COUNT(*) as count FROM GPI_Documents 
            WHERE CAST(document_date AS DATE) = CAST(GETDATE() AS DATE) ${branchFilter}
        `);
        
        // Get this month's records count
        const monthResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM GPI_Documents 
                WHERE MONTH(document_date) = MONTH(GETDATE()) 
                AND YEAR(document_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        // Get total locations
        const locationsResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM GPI_Locations WHERE is_active = 1');
        
        // Get issues count (bad condition this month)
        const issuesResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM GPI_Documents 
                WHERE condition_good = 0
                AND MONTH(document_date) = MONTH(GETDATE()) 
                AND YEAR(document_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        res.json({
            todayRecords: todayResult.recordset[0].count,
            monthRecords: monthResult.recordset[0].count,
            totalLocations: locationsResult.recordset[0].count,
            issuesCount: issuesResult.recordset[0].count
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
                SELECT d.*, l.location_name, l.location_code, i.item_name, i.item_code
                FROM GPI_Documents d
                LEFT JOIN GPI_Locations l ON d.location_id = l.id
                LEFT JOIN GPI_Items i ON d.item_id = i.id
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
