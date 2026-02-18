/**
 * Food Safety Verification Sheet Module
 * Form 4 - Food Safety Monitoring System
 */

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

// Cache-busting middleware
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ==========================================
// Page Routes
// ==========================================

router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.get('/references', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'references.html'));
});

router.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

router.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'history.html'));
});

router.get('/schedule', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'schedule.html'));
});

router.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// ==========================================
// API Routes - Current User
// ==========================================

router.get('/api/me', (req, res) => {
    if (req.currentUser) {
        res.json(req.currentUser);
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

// ==========================================
// API Routes - Settings
// ==========================================

// Get settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query(`SELECT * FROM FoodSafetySettings`);
        
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

// Update settings
router.put('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        for (const [key, value] of Object.entries(req.body)) {
            await pool.request()
                .input('key', sql.NVarChar, key)
                .input('value', sql.NVarChar, value)
                .query(`
                    IF EXISTS (SELECT 1 FROM FoodSafetySettings WHERE setting_key = @key)
                        UPDATE FoodSafetySettings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO FoodSafetySettings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// API Routes - References
// ==========================================

// Get all references
router.get('/api/references', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query(`SELECT * FROM FoodSafetyReferences WHERE is_active = 1 ORDER BY name`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching references:', err);
        res.status(500).json({ error: 'Failed to fetch references' });
    }
});

// Get single reference
router.get('/api/references/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT * FROM FoodSafetyReferences WHERE id = @id`);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reference not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching reference:', err);
        res.status(500).json({ error: 'Failed to fetch reference' });
    }
});

// Create reference
router.post('/api/references', async (req, res) => {
    try {
        const { name, frequency, reference, accept_error, reference_value, reference_value_method, unit_of_measurement } = req.body;
        
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('name', sql.NVarChar, name)
            .input('frequency', sql.NVarChar, frequency)
            .input('reference', sql.NVarChar, reference || null)
            .input('accept_error', sql.NVarChar, accept_error || null)
            .input('reference_value', sql.NVarChar, reference_value || null)
            .input('reference_value_method', sql.NVarChar, reference_value_method || null)
            .input('unit_of_measurement', sql.NVarChar, unit_of_measurement || null)
            .query(`
                INSERT INTO FoodSafetyReferences (name, frequency, reference, accept_error, reference_value, reference_value_method, unit_of_measurement)
                OUTPUT INSERTED.*
                VALUES (@name, @frequency, @reference, @accept_error, @reference_value, @reference_value_method, @unit_of_measurement)
            `);
        
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating reference:', err);
        res.status(500).json({ error: 'Failed to create reference' });
    }
});

// Update reference
router.put('/api/references/:id', async (req, res) => {
    try {
        const { name, frequency, reference, accept_error, reference_value, reference_value_method, unit_of_measurement } = req.body;
        
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('name', sql.NVarChar, name)
            .input('frequency', sql.NVarChar, frequency)
            .input('reference', sql.NVarChar, reference || null)
            .input('accept_error', sql.NVarChar, accept_error || null)
            .input('reference_value', sql.NVarChar, reference_value || null)
            .input('reference_value_method', sql.NVarChar, reference_value_method || null)
            .input('unit_of_measurement', sql.NVarChar, unit_of_measurement || null)
            .query(`
                UPDATE FoodSafetyReferences 
                SET name = @name, frequency = @frequency, reference = @reference,
                    accept_error = @accept_error, reference_value = @reference_value, 
                    reference_value_method = @reference_value_method,
                    unit_of_measurement = @unit_of_measurement, updated_at = GETDATE()
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reference not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error updating reference:', err);
        res.status(500).json({ error: 'Failed to update reference' });
    }
});

// Delete reference (soft delete)
router.delete('/api/references/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`UPDATE FoodSafetyReferences SET is_active = 0 WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting reference:', err);
        res.status(500).json({ error: 'Failed to delete reference' });
    }
});

// ==========================================
// API Routes - Verification Records
// ==========================================

// Get verification history
router.get('/api/verifications', async (req, res) => {
    try {
        const { from, to, status, verified, procedure } = req.query;
        
        let query = `
            SELECT 
                s.*,
                COUNT(r.id) as record_count,
                CASE WHEN SUM(CASE WHEN r.status = 'Fail' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END as has_failures,
                STUFF((
                    SELECT DISTINCT ', ' + procedure_name
                    FROM FoodSafetyVerificationRecords
                    WHERE session_id = s.id AND procedure_name IS NOT NULL
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') as procedures
            FROM FoodSafetyVerificationSessions s
            LEFT JOIN FoodSafetyVerificationRecords r ON s.id = r.session_id
            WHERE 1=1
        `;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        
        if (from) {
            query += ` AND s.verification_date >= @from`;
            request.input('from', sql.Date, from);
        }
        if (to) {
            query += ` AND s.verification_date <= @to`;
            request.input('to', sql.Date, to);
        }
        if (verified !== undefined && verified !== '') {
            query += ` AND s.verified = @verified`;
            request.input('verified', sql.Bit, verified === '1');
        }
        
        // Filter by procedure - find sessions that have records with this procedure
        if (procedure) {
            query += ` AND EXISTS (SELECT 1 FROM FoodSafetyVerificationRecords r2 WHERE r2.session_id = s.id AND r2.procedure_name = @procedure)`;
            request.input('procedure', sql.NVarChar, procedure);
        }
        
        query += ` GROUP BY s.id, s.document_number, s.verification_date, s.branch, s.verified_by, s.verified, s.verified_by_user, s.verified_at, s.created_at, s.updated_at`;
        query += ` ORDER BY s.verification_date DESC, s.id DESC`;
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching verifications:', err);
        res.status(500).json({ error: 'Failed to fetch verifications' });
    }
});

// Get single verification with records
router.get('/api/verifications/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        const sessionResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT * FROM FoodSafetyVerificationSessions WHERE id = @id`);
        
        if (sessionResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Verification not found' });
        }
        
        const recordsResult = await pool.request()
            .input('session_id', sql.Int, req.params.id)
            .query(`
                SELECT r.*, ref.name as procedure_name, ref.reference, ref.accept_error, ref.reference_value_method
                FROM FoodSafetyVerificationRecords r
                JOIN FoodSafetyReferences ref ON r.reference_id = ref.id
                WHERE r.session_id = @session_id
                ORDER BY r.id
            `);
        
        res.json({
            session: sessionResult.recordset[0],
            records: recordsResult.recordset
        });
    } catch (err) {
        console.error('Error fetching verification:', err);
        res.status(500).json({ error: 'Failed to fetch verification' });
    }
});

// Create verification batch
router.post('/api/verifications/batch', async (req, res) => {
    try {
        const { verification_date, branch, records } = req.body;
        const verifiedBy = req.currentUser?.displayName || req.currentUser?.name || 'Unknown';
        
        const pool = await sql.connect(dbConfig);
        
        // Generate document number
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        
        const countResult = await pool.request()
            .input('date', sql.Date, verification_date)
            .query(`SELECT COUNT(*) as count FROM FoodSafetyVerificationSessions WHERE CAST(verification_date AS DATE) = @date`);
        
        const count = countResult.recordset[0].count + 1;
        const documentNumber = `FSV-${dateStr}-${String(count).padStart(3, '0')}`;
        
        // Create session
        const sessionResult = await pool.request()
            .input('document_number', sql.NVarChar, documentNumber)
            .input('verification_date', sql.Date, verification_date)
            .input('branch', sql.NVarChar, branch || null)
            .input('verified_by', sql.NVarChar, verifiedBy)
            .query(`
                INSERT INTO FoodSafetyVerificationSessions (document_number, verification_date, branch, verified_by)
                OUTPUT INSERTED.*
                VALUES (@document_number, @verification_date, @branch, @verified_by)
            `);
        
        const sessionId = sessionResult.recordset[0].id;
        
        // Insert records
        for (const record of records) {
            await pool.request()
                .input('session_id', sql.Int, sessionId)
                .input('reference_id', sql.Int, record.reference_id)
                .input('procedure_name', sql.NVarChar, record.procedure_name || null)
                .input('item_name', sql.NVarChar, record.item_name || null)
                .input('unit_of_measurement', sql.NVarChar, record.unit_of_measurement || null)
                .input('test_value', sql.NVarChar, record.test_value || null)
                .input('reference_value', sql.NVarChar, record.reference_value || null)
                .input('difference', sql.NVarChar, record.difference || null)
                .input('status', sql.NVarChar, record.status || 'Pass')
                .input('corrective_action', sql.NVarChar, record.corrective_action || null)
                .input('next_due_date', sql.Date, record.next_due_date || null)
                .input('comments', sql.NVarChar, record.comments || null)
                .query(`
                    INSERT INTO FoodSafetyVerificationRecords 
                    (session_id, reference_id, procedure_name, item_name, unit_of_measurement, test_value, reference_value, difference, status, corrective_action, next_due_date, comments)
                    VALUES (@session_id, @reference_id, @procedure_name, @item_name, @unit_of_measurement, @test_value, @reference_value, @difference, @status, @corrective_action, @next_due_date, @comments)
                `);
            
            // Update next due date on reference
            if (record.next_due_date) {
                await pool.request()
                    .input('ref_id', sql.Int, record.reference_id)
                    .input('next_due', sql.Date, record.next_due_date)
                    .query(`UPDATE FoodSafetyReferences SET next_due_date = @next_due WHERE id = @ref_id`);
            }
        }
        
        res.status(201).json({ 
            success: true, 
            session_id: sessionId, 
            document_number: documentNumber 
        });
    } catch (err) {
        console.error('Error creating verification:', err);
        res.status(500).json({ error: 'Failed to create verification' });
    }
});

// Verify (approve) a verification session
router.put('/api/verifications/:id/verify', async (req, res) => {
    try {
        const verifiedBy = req.currentUser?.displayName || req.currentUser?.name || 'Unknown';
        
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by_user', sql.NVarChar, verifiedBy)
            .query(`
                UPDATE FoodSafetyVerificationSessions 
                SET verified = 1, verified_by_user = @verified_by_user, verified_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error verifying:', err);
        res.status(500).json({ error: 'Failed to verify' });
    }
});

// Update verification (Admin/Super Auditor only)
router.put('/api/verifications/:id', async (req, res) => {
    try {
        const userRole = req.currentUser?.role || '';
        if (userRole !== 'Admin' && userRole !== 'SuperAuditor') {
            return res.status(403).json({ error: 'Only Admin and SuperAuditor can edit verified records' });
        }
        
        const { verification_date, record } = req.body;
        
        const pool = await sql.connect(dbConfig);
        
        // Update session date
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verification_date', sql.Date, verification_date)
            .query(`UPDATE FoodSafetyVerificationSessions SET verification_date = @verification_date, updated_at = GETDATE() WHERE id = @id`);
        
        // Update first record (single record edit)
        if (record) {
            await pool.request()
                .input('session_id', sql.Int, req.params.id)
                .input('item_name', sql.NVarChar, record.item_name || null)
                .input('test_value', sql.NVarChar, record.test_value || null)
                .input('reference_value', sql.NVarChar, record.reference_value || null)
                .input('difference', sql.NVarChar, record.difference || null)
                .input('status', sql.NVarChar, record.status || 'Pass')
                .input('corrective_action', sql.NVarChar, record.corrective_action || null)
                .input('comments', sql.NVarChar, record.comments || null)
                .query(`
                    UPDATE FoodSafetyVerificationRecords 
                    SET item_name = @item_name, test_value = @test_value, reference_value = @reference_value, difference = @difference,
                        status = @status, corrective_action = @corrective_action, comments = @comments
                    WHERE session_id = @session_id
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating verification:', err);
        res.status(500).json({ error: 'Failed to update verification' });
    }
});

// ==========================================
// API Routes - Schedule
// ==========================================

router.get('/api/schedule', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query(`
                SELECT id, name, frequency, reference, accept_error, reference_value_method, unit_of_measurement, next_due_date
                FROM FoodSafetyReferences 
                WHERE is_active = 1
                ORDER BY 
                    CASE WHEN next_due_date IS NULL THEN 1 ELSE 0 END,
                    next_due_date ASC
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching schedule:', err);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

// Get alerts count
router.get('/api/alerts/count', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query(`
                SELECT COUNT(*) as count 
                FROM FoodSafetyReferences 
                WHERE is_active = 1 
                AND next_due_date IS NOT NULL 
                AND next_due_date <= CAST(GETDATE() AS DATE)
            `);
        res.json({ count: result.recordset[0].count });
    } catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

module.exports = router;
