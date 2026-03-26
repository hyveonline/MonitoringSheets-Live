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

// Middleware to ensure UTF-8 encoding for API responses
router.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

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

// One-time fix for Arabic encoding - call /pest-activity-sighting/api/fix-arabic once
router.get('/api/fix-arabic', async (req, res) => {
    try {
        const pool = await getConnection();
        
        // Fix Pest Types
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'نمل' WHERE pest_type_en = 'Ant'`);
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'طيور' WHERE pest_type_en = 'Bird'`);
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'صرصور' WHERE pest_type_en = 'Cockroach'`);
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'ذباب' WHERE pest_type_en = 'Fly'`);
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'أخرى' WHERE pest_type_en = 'Other'`);
        await pool.request().query(`UPDATE PAS_PestTypes SET pest_type_ar = N'قوارض' WHERE pest_type_en = 'Rodent'`);
        
        // Fix Locations
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'المطبخ' WHERE location_en = 'Kitchen'`);
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'غرفة التخزين' WHERE location_en = 'Storage Room'`);
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'منطقة الاستلام' WHERE location_en = 'Receiving Area'`);
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'منطقة تناول الطعام' WHERE location_en = 'Dining Area'`);
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'منطقة النفايات' WHERE location_en = 'Waste Area'`);
        await pool.request().query(`UPDATE PAS_Locations SET location_ar = N'المكتب' WHERE location_en = 'Office'`);
        
        res.json({ success: true, message: 'Arabic encoding fixed!' });
    } catch (err) {
        console.error('Error fixing Arabic:', err);
        res.status(500).json({ error: 'Failed to fix Arabic encoding', details: err.message });
    }
});

// ==========================================
// Settings API
// ==========================================

router.get('/api/settings', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query('SELECT setting_key, setting_value FROM PAS_Settings');
        
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

router.post('/api/settings', async (req, res) => {
    try {
        const pool = await getConnection();
        const { company_name, reference, edition, creation_date, last_revision_date } = req.body;
        
        const updates = [
            { key: 'company_name', value: company_name },
            { key: 'reference', value: reference },
            { key: 'edition', value: edition },
            { key: 'creation_date', value: creation_date },
            { key: 'last_revision_date', value: last_revision_date }
        ];
        
        for (const update of updates) {
            if (update.value !== undefined) {
                // Try update first, if no rows affected then insert
                const result = await pool.request()
                    .input('key', sql.NVarChar, update.key)
                    .input('value', sql.NVarChar, update.value)
                    .query(`
                        UPDATE PAS_Settings 
                        SET setting_value = @value, updated_at = GETDATE() 
                        WHERE setting_key = @key
                    `);
                
                if (result.rowsAffected[0] === 0) {
                    await pool.request()
                        .input('key', sql.NVarChar, update.key)
                        .input('value', sql.NVarChar, update.value)
                        .query(`
                            INSERT INTO PAS_Settings (setting_key, setting_value) 
                            VALUES (@key, @value)
                        `);
                }
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// Pest Types API
// ==========================================

router.get('/api/pest-types', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT id, pest_type_en, pest_type_ar, is_active 
            FROM PAS_PestTypes 
            WHERE is_active = 1
            ORDER BY pest_type_en
        `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching pest types:', err);
        res.status(500).json({ error: 'Failed to fetch pest types' });
    }
});

router.post('/api/pest-types', async (req, res) => {
    try {
        const pool = await getConnection();
        const { pest_type_en, pest_type_ar } = req.body;
        
        const result = await pool.request()
            .input('pest_type_en', sql.NVarChar, pest_type_en)
            .input('pest_type_ar', sql.NVarChar, pest_type_ar || null)
            .query(`
                INSERT INTO PAS_PestTypes (pest_type_en, pest_type_ar)
                OUTPUT INSERTED.id
                VALUES (@pest_type_en, @pest_type_ar)
            `);
        
        res.json({ success: true, id: result.recordset[0].id });
    } catch (err) {
        console.error('Error adding pest type:', err);
        res.status(500).json({ error: 'Failed to add pest type' });
    }
});

router.delete('/api/pest-types/:id', async (req, res) => {
    try {
        const pool = await getConnection();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE PAS_PestTypes SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting pest type:', err);
        res.status(500).json({ error: 'Failed to delete pest type' });
    }
});

// ==========================================
// Locations API
// ==========================================

router.get('/api/locations', async (req, res) => {
    try {
        const pool = await getConnection();
        const result = await pool.request().query(`
            SELECT id, location_en, location_ar, is_active 
            FROM PAS_Locations 
            WHERE is_active = 1
            ORDER BY location_en
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
        const { location_en, location_ar } = req.body;
        
        const result = await pool.request()
            .input('location_en', sql.NVarChar, location_en)
            .input('location_ar', sql.NVarChar, location_ar || null)
            .query(`
                INSERT INTO PAS_Locations (location_en, location_ar)
                OUTPUT INSERTED.id
                VALUES (@location_en, @location_ar)
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
            .query('UPDATE PAS_Locations SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting location:', err);
        res.status(500).json({ error: 'Failed to delete location' });
    }
});

// ==========================================
// Documents API
// ==========================================

router.get('/api/documents', async (req, res) => {
    try {
        const pool = await getConnection();
        const { startDate, endDate, location_id, pest_type_id, branch_id } = req.query;
        
        let query = `
            SELECT d.*, 
                   l.location_en, l.location_ar,
                   p.pest_type_en, p.pest_type_ar
            FROM PAS_Documents d
            LEFT JOIN PAS_Locations l ON d.location_id = l.id
            LEFT JOIN PAS_PestTypes p ON d.pest_type_id = p.id
            WHERE 1=1
        `;
        
        const request = pool.request();
        
        if (startDate) {
            query += ' AND d.sighting_date >= @startDate';
            request.input('startDate', sql.Date, startDate);
        }
        if (endDate) {
            query += ' AND d.sighting_date <= @endDate';
            request.input('endDate', sql.Date, endDate);
        }
        if (location_id) {
            query += ' AND d.location_id = @location_id';
            request.input('location_id', sql.Int, location_id);
        }
        if (pest_type_id) {
            query += ' AND d.pest_type_id = @pest_type_id';
            request.input('pest_type_id', sql.Int, pest_type_id);
        }
        if (branch_id) {
            query += ' AND d.branch_id = @branch_id';
            request.input('branch_id', sql.Int, branch_id);
        }
        
        query += ' ORDER BY d.sighting_date DESC, d.created_at DESC';
        
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
                SELECT d.*, 
                       l.location_en, l.location_ar,
                       p.pest_type_en, p.pest_type_ar
                FROM PAS_Documents d
                LEFT JOIN PAS_Locations l ON d.location_id = l.id
                LEFT JOIN PAS_PestTypes p ON d.pest_type_id = p.id
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
            sighting_date,
            sighting_time,
            location_id,
            pest_type_id,
            pest_number,
            reported_by,
            date_reported,
            contractor_notified,
            action_taken,
            action_by_whom,
            action_results,
            follow_up_remarks,
            branch_id
        } = req.body;
        
        const result = await pool.request()
            .input('sighting_date', sql.Date, sighting_date)
            .input('sighting_time', sql.Time, sighting_time || null)
            .input('location_id', sql.Int, location_id || null)
            .input('pest_type_id', sql.Int, pest_type_id || null)
            .input('pest_number', sql.Int, pest_number || null)
            .input('reported_by', sql.NVarChar, reported_by)
            .input('date_reported', sql.Date, date_reported || null)
            .input('contractor_notified', sql.Bit, contractor_notified)
            .input('action_taken', sql.NVarChar, action_taken || null)
            .input('action_by_whom', sql.NVarChar, action_by_whom || null)
            .input('action_results', sql.NVarChar, action_results || null)
            .input('follow_up_remarks', sql.NVarChar, follow_up_remarks || null)
            .input('branch_id', sql.Int, branch_id || null)
            .query(`
                INSERT INTO PAS_Documents (
                    sighting_date, sighting_time, location_id, pest_type_id, pest_number,
                    reported_by, date_reported, contractor_notified,
                    action_taken, action_by_whom, action_results, follow_up_remarks, branch_id
                )
                OUTPUT INSERTED.id
                VALUES (
                    @sighting_date, @sighting_time, @location_id, @pest_type_id, @pest_number,
                    @reported_by, @date_reported, @contractor_notified,
                    @action_taken, @action_by_whom, @action_results, @follow_up_remarks, @branch_id
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
            sighting_date,
            sighting_time,
            location_id,
            pest_type_id,
            pest_number,
            reported_by,
            date_reported,
            contractor_notified,
            action_taken,
            action_by_whom,
            action_results,
            follow_up_remarks
        } = req.body;
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('sighting_date', sql.Date, sighting_date)
            .input('sighting_time', sql.Time, sighting_time || null)
            .input('location_id', sql.Int, location_id || null)
            .input('pest_type_id', sql.Int, pest_type_id || null)
            .input('pest_number', sql.Int, pest_number || null)
            .input('reported_by', sql.NVarChar, reported_by)
            .input('date_reported', sql.Date, date_reported || null)
            .input('contractor_notified', sql.Bit, contractor_notified)
            .input('action_taken', sql.NVarChar, action_taken || null)
            .input('action_by_whom', sql.NVarChar, action_by_whom || null)
            .input('action_results', sql.NVarChar, action_results || null)
            .input('follow_up_remarks', sql.NVarChar, follow_up_remarks || null)
            .query(`
                UPDATE PAS_Documents SET
                    sighting_date = @sighting_date,
                    sighting_time = @sighting_time,
                    location_id = @location_id,
                    pest_type_id = @pest_type_id,
                    pest_number = @pest_number,
                    reported_by = @reported_by,
                    date_reported = @date_reported,
                    contractor_notified = @contractor_notified,
                    action_taken = @action_taken,
                    action_by_whom = @action_by_whom,
                    action_results = @action_results,
                    follow_up_remarks = @follow_up_remarks,
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
            .query('DELETE FROM PAS_Documents WHERE id = @id');
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
        
        // Get today's sightings count
        const todayResult = await request.query(`
            SELECT COUNT(*) as count FROM PAS_Documents 
            WHERE CAST(sighting_date AS DATE) = CAST(GETDATE() AS DATE) ${branchFilter}
        `);
        
        // Get this month's sightings count
        const monthResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM PAS_Documents 
                WHERE MONTH(sighting_date) = MONTH(GETDATE()) 
                AND YEAR(sighting_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        // Get total pest types
        const pestTypesResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM PAS_PestTypes WHERE is_active = 1');
        
        // Get contractor notifications pending (this month where contractor_notified = 0)
        const pendingResult = await pool.request()
            .query(`
                SELECT COUNT(*) as count FROM PAS_Documents 
                WHERE contractor_notified = 0
                AND MONTH(sighting_date) = MONTH(GETDATE()) 
                AND YEAR(sighting_date) = YEAR(GETDATE()) ${branchFilter}
            `);
        
        res.json({
            todayRecords: todayResult.recordset[0].count,
            monthRecords: monthResult.recordset[0].count,
            totalPestTypes: pestTypesResult.recordset[0].count,
            pendingNotifications: pendingResult.recordset[0].count
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
                SELECT d.*, 
                       l.location_en, l.location_ar,
                       p.pest_type_en, p.pest_type_ar
                FROM PAS_Documents d
                LEFT JOIN PAS_Locations l ON d.location_id = l.id
                LEFT JOIN PAS_PestTypes p ON d.pest_type_id = p.id
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
