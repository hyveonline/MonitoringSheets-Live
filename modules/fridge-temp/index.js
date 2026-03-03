/**
 * Fridge Temperature Monitoring Module
 * Form 11: Track fridge temperatures every 3 hours
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

// Default time slots (fallback if DB not available)
const DEFAULT_TIME_SLOTS = ['01am', '04am', '07am', '10am', '01pm', '04pm', '07pm', '10pm'];
const DEFAULT_TIME_LABELS = {
    '01am': '1:00 AM',
    '04am': '4:00 AM',
    '07am': '7:00 AM',
    '10am': '10:00 AM',
    '01pm': '1:00 PM',
    '04pm': '4:00 PM',
    '07pm': '7:00 PM',
    '10pm': '10:00 PM'
};

// Get time slots from database
async function getTimeSlots() {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM FridgeTempTimeSlots WHERE is_active = 1 ORDER BY display_order');
        
        if (result.recordset.length > 0) {
            const slots = result.recordset.map(r => r.slot_key);
            const labels = {};
            result.recordset.forEach(r => {
                labels[r.slot_key] = r.slot_label;
            });
            return { slots, labels };
        }
    } catch (err) {
        console.error('Error loading time slots:', err);
    }
    return { slots: DEFAULT_TIME_SLOTS, labels: DEFAULT_TIME_LABELS };
}

// Get database connection
async function getPool() {
    try {
        const pool = await sql.connect(dbConfig);
        return pool;
    } catch (err) {
        console.error('Database connection error:', err);
        throw err;
    }
}

// Calculate status based on temperature and acceptable range
function calculateStatus(temp, minTemp, maxTemp) {
    if (temp === null || temp === undefined || temp === '') return null;
    const numTemp = parseFloat(temp);
    if (isNaN(numTemp)) return null;
    return (numTemp >= minTemp && numTemp <= maxTemp) ? 'Pass' : 'Fail';
}

// Parse temperature value - returns null for invalid/empty values
function parseTemp(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(value);
    if (isNaN(num)) return null;
    return num;
}

// Disable caching for all responses
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

// Serve static pages with no-cache headers
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.get('/form', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

router.get('/history', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'history.html'));
});

router.get('/settings', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// API: Get current user
router.get('/api/current-user', (req, res) => {
    if (req.currentUser) {
        res.json({
            name: req.currentUser.displayName || req.currentUser.name,
            email: req.currentUser.email,
            role: req.currentUser.role
        });
    } else {
        res.json({ name: 'Unknown User', email: '', role: 'User' });
    }
});

// API: Get time slots info (from database)
router.get('/api/time-slots', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM FridgeTempTimeSlots WHERE is_active = 1 ORDER BY display_order');
        
        const slots = result.recordset.map(r => r.slot_key);
        const labels = {};
        result.recordset.forEach(r => {
            labels[r.slot_key] = r.slot_label;
        });
        
        res.json({ slots, labels, records: result.recordset });
    } catch (err) {
        console.error('Error fetching time slots:', err);
        res.json({ slots: DEFAULT_TIME_SLOTS, labels: DEFAULT_TIME_LABELS, records: [] });
    }
});

// API: Update time slot label
router.put('/api/time-slots/:id', async (req, res) => {
    try {
        const { slot_label } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('slot_label', sql.NVarChar, slot_label)
            .query('UPDATE FridgeTempTimeSlots SET slot_label = @slot_label, updated_at = GETDATE() WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating time slot:', err);
        res.status(500).json({ error: 'Failed to update time slot' });
    }
});

// API: Toggle time slot active status
router.put('/api/time-slots/:id/toggle', async (req, res) => {
    try {
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE FridgeTempTimeSlots SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = GETDATE() WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error toggling time slot:', err);
        res.status(500).json({ error: 'Failed to toggle time slot' });
    }
});

// ==========================================
// Fridge Management APIs
// ==========================================

// Get all fridges
router.get('/api/fridges', async (req, res) => {
    try {
        const { section } = req.query;
        const pool = await getPool();
        
        let query = 'SELECT * FROM Fridges WHERE is_active = 1';
        const request = pool.request();
        
        if (section) {
            query += ' AND section = @section';
            request.input('section', sql.NVarChar, section);
        }
        
        query += ' ORDER BY section, fridge_name';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching fridges:', err);
        res.status(500).json({ error: 'Failed to fetch fridges' });
    }
});

// Get all sections
router.get('/api/sections', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT DISTINCT section FROM Fridges WHERE is_active = 1 ORDER BY section');
        res.json(result.recordset.map(r => r.section));
    } catch (err) {
        console.error('Error fetching sections:', err);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// Add fridge
router.post('/api/fridges', async (req, res) => {
    try {
        const { fridge_name, section, min_temp, max_temp } = req.body;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('fridge_name', sql.NVarChar, fridge_name)
            .input('section', sql.NVarChar, section)
            .input('min_temp', sql.Decimal(5, 2), min_temp)
            .input('max_temp', sql.Decimal(5, 2), max_temp)
            .query(`INSERT INTO Fridges (fridge_name, section, min_temp, max_temp) 
                    OUTPUT INSERTED.* 
                    VALUES (@fridge_name, @section, @min_temp, @max_temp)`);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding fridge:', err);
        res.status(500).json({ error: 'Failed to add fridge' });
    }
});

// Update fridge
router.put('/api/fridges/:id', async (req, res) => {
    try {
        const { fridge_name, section, min_temp, max_temp } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('fridge_name', sql.NVarChar, fridge_name)
            .input('section', sql.NVarChar, section)
            .input('min_temp', sql.Decimal(5, 2), min_temp)
            .input('max_temp', sql.Decimal(5, 2), max_temp)
            .query(`UPDATE Fridges SET 
                    fridge_name = @fridge_name, 
                    section = @section, 
                    min_temp = @min_temp, 
                    max_temp = @max_temp,
                    updated_at = GETDATE()
                    WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating fridge:', err);
        res.status(500).json({ error: 'Failed to update fridge' });
    }
});

// Delete fridge (soft delete)
router.delete('/api/fridges/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE Fridges SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting fridge:', err);
        res.status(500).json({ error: 'Failed to delete fridge' });
    }
});

// ==========================================
// Document & Reading APIs
// ==========================================

// Get all documents (history)
router.get('/api/documents', async (req, res) => {
    try {
        const { date, section, status } = req.query;
        const pool = await getPool();
        
        let query = `SELECT d.*, 
                     (SELECT COUNT(*) FROM FridgeTempReadings WHERE document_id = d.id) as fridge_count
                     FROM FridgeTempDocuments d WHERE 1=1`;
        const request = pool.request();
        
        if (date) {
            query += ' AND d.log_date = @date';
            request.input('date', sql.Date, date);
        }
        
        if (section) {
            // Filter by section: find documents that have readings from fridges in the selected section
            query += ` AND EXISTS (
                SELECT 1 FROM FridgeTempReadings r 
                INNER JOIN Fridges f ON r.fridge_id = f.id 
                WHERE r.document_id = d.id AND f.section = @section
            )`;
            request.input('section', sql.NVarChar, section);
        }
        
        if (status) {
            query += ' AND d.status = @status';
            request.input('status', sql.NVarChar, status);
        }
        
        query += ' ORDER BY d.log_date DESC, d.created_at DESC';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Check if document exists for date (one doc per day)
router.get('/api/documents/check', async (req, res) => {
    try {
        const { date } = req.query;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('date', sql.Date, date)
            .query(`SELECT * FROM FridgeTempDocuments WHERE log_date = @date`);
        
        if (result.recordset.length > 0) {
            res.json({ exists: true, document: result.recordset[0] });
        } else {
            res.json({ exists: false });
        }
    } catch (err) {
        console.error('Error checking document:', err);
        res.status(500).json({ error: 'Failed to check document' });
    }
});

// Get single document with readings
router.get('/api/documents/:id', async (req, res) => {
    try {
        const { section } = req.query;
        const pool = await getPool();
        
        const docResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM FridgeTempDocuments WHERE id = @id');
        
        if (docResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        let readingsQuery = `SELECT r.*, f.min_temp, f.max_temp, f.section 
                    FROM FridgeTempReadings r 
                    JOIN Fridges f ON r.fridge_id = f.id
                    WHERE r.document_id = @document_id`;
        
        const readingsRequest = pool.request()
            .input('document_id', sql.Int, req.params.id);
        
        if (section) {
            readingsQuery += ' AND f.section = @section';
            readingsRequest.input('section', sql.NVarChar, section);
        }
        
        readingsQuery += ' ORDER BY f.section, r.fridge_name';
        
        const readingsResult = await readingsRequest.query(readingsQuery);
        
        res.json({
            document: docResult.recordset[0],
            readings: readingsResult.recordset
        });
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// Create or update document with readings
router.post('/api/documents', async (req, res) => {
    try {
        const { log_date, filled_by, readings } = req.body;
        const pool = await getPool();
        
        // Check if document exists for this DATE (one document per day)
        const existingDoc = await pool.request()
            .input('date', sql.Date, log_date)
            .query('SELECT * FROM FridgeTempDocuments WHERE log_date = @date');
        
        let documentId;
        let documentNumber;
        
        if (existingDoc.recordset.length > 0) {
            // Update existing document
            documentId = existingDoc.recordset[0].id;
            documentNumber = existingDoc.recordset[0].document_number;
            
            await pool.request()
                .input('id', sql.Int, documentId)
                .input('filled_by', sql.NVarChar, filled_by)
                .query('UPDATE FridgeTempDocuments SET filled_by = @filled_by, updated_at = GETDATE() WHERE id = @id');
        } else {
            // Generate document number: FTM-YYYYMMDD-001
            const dateStr = new Date(log_date).toISOString().split('T')[0].replace(/-/g, '');
            documentNumber = `FTM-${dateStr}-001`;
            
            // Create new document (section is null - all sections in one doc)
            const insertResult = await pool.request()
                .input('document_number', sql.NVarChar, documentNumber)
                .input('log_date', sql.Date, log_date)
                .input('filled_by', sql.NVarChar, filled_by)
                .query(`INSERT INTO FridgeTempDocuments (document_number, log_date, section, filled_by) 
                        OUTPUT INSERTED.id VALUES (@document_number, @log_date, 'All Sections', @filled_by)`);
            
            documentId = insertResult.recordset[0].id;
        }
        
        // Get ALL fridges to get min/max temps
        const fridgesResult = await pool.request()
            .query('SELECT * FROM Fridges WHERE is_active = 1');
        
        const fridgeMap = {};
        fridgesResult.recordset.forEach(f => {
            fridgeMap[f.id] = f;
        });
        
        // Process each reading
        for (const reading of readings) {
            const fridge = fridgeMap[reading.fridge_id];
            if (!fridge) continue;
            
            // Check if reading exists
            const existingReading = await pool.request()
                .input('document_id', sql.Int, documentId)
                .input('fridge_id', sql.Int, reading.fridge_id)
                .query('SELECT * FROM FridgeTempReadings WHERE document_id = @document_id AND fridge_id = @fridge_id');
            
            // Calculate status for each time slot
            const statuses = {};
            DEFAULT_TIME_SLOTS.forEach(slot => {
                statuses[`status_${slot}`] = calculateStatus(
                    reading[`temp_${slot}`], 
                    fridge.min_temp, 
                    fridge.max_temp
                );
            });
            
            if (existingReading.recordset.length > 0) {
                // Update reading
                await pool.request()
                    .input('id', sql.Int, existingReading.recordset[0].id)
                    .input('temp_01am', sql.Decimal(5, 2), parseTemp(reading.temp_01am))
                    .input('status_01am', sql.NVarChar, statuses.status_01am)
                    .input('temp_04am', sql.Decimal(5, 2), parseTemp(reading.temp_04am))
                    .input('status_04am', sql.NVarChar, statuses.status_04am)
                    .input('temp_07am', sql.Decimal(5, 2), parseTemp(reading.temp_07am))
                    .input('status_07am', sql.NVarChar, statuses.status_07am)
                    .input('temp_10am', sql.Decimal(5, 2), parseTemp(reading.temp_10am))
                    .input('status_10am', sql.NVarChar, statuses.status_10am)
                    .input('temp_01pm', sql.Decimal(5, 2), parseTemp(reading.temp_01pm))
                    .input('status_01pm', sql.NVarChar, statuses.status_01pm)
                    .input('temp_04pm', sql.Decimal(5, 2), parseTemp(reading.temp_04pm))
                    .input('status_04pm', sql.NVarChar, statuses.status_04pm)
                    .input('temp_07pm', sql.Decimal(5, 2), parseTemp(reading.temp_07pm))
                    .input('status_07pm', sql.NVarChar, statuses.status_07pm)
                    .input('temp_10pm', sql.Decimal(5, 2), parseTemp(reading.temp_10pm))
                    .input('status_10pm', sql.NVarChar, statuses.status_10pm)
                    .input('corrective_action', sql.NVarChar, reading.corrective_action || null)
                    .query(`UPDATE FridgeTempReadings SET 
                            temp_01am = @temp_01am, status_01am = @status_01am,
                            temp_04am = @temp_04am, status_04am = @status_04am,
                            temp_07am = @temp_07am, status_07am = @status_07am,
                            temp_10am = @temp_10am, status_10am = @status_10am,
                            temp_01pm = @temp_01pm, status_01pm = @status_01pm,
                            temp_04pm = @temp_04pm, status_04pm = @status_04pm,
                            temp_07pm = @temp_07pm, status_07pm = @status_07pm,
                            temp_10pm = @temp_10pm, status_10pm = @status_10pm,
                            corrective_action = @corrective_action
                            WHERE id = @id`);
            } else {
                // Insert new reading
                await pool.request()
                    .input('document_id', sql.Int, documentId)
                    .input('fridge_id', sql.Int, reading.fridge_id)
                    .input('fridge_name', sql.NVarChar, fridge.fridge_name)
                    .input('temp_01am', sql.Decimal(5, 2), parseTemp(reading.temp_01am))
                    .input('status_01am', sql.NVarChar, statuses.status_01am)
                    .input('temp_04am', sql.Decimal(5, 2), parseTemp(reading.temp_04am))
                    .input('status_04am', sql.NVarChar, statuses.status_04am)
                    .input('temp_07am', sql.Decimal(5, 2), parseTemp(reading.temp_07am))
                    .input('status_07am', sql.NVarChar, statuses.status_07am)
                    .input('temp_10am', sql.Decimal(5, 2), parseTemp(reading.temp_10am))
                    .input('status_10am', sql.NVarChar, statuses.status_10am)
                    .input('temp_01pm', sql.Decimal(5, 2), parseTemp(reading.temp_01pm))
                    .input('status_01pm', sql.NVarChar, statuses.status_01pm)
                    .input('temp_04pm', sql.Decimal(5, 2), parseTemp(reading.temp_04pm))
                    .input('status_04pm', sql.NVarChar, statuses.status_04pm)
                    .input('temp_07pm', sql.Decimal(5, 2), parseTemp(reading.temp_07pm))
                    .input('status_07pm', sql.NVarChar, statuses.status_07pm)
                    .input('temp_10pm', sql.Decimal(5, 2), parseTemp(reading.temp_10pm))
                    .input('status_10pm', sql.NVarChar, statuses.status_10pm)
                    .input('corrective_action', sql.NVarChar, reading.corrective_action || null)
                    .query(`INSERT INTO FridgeTempReadings 
                            (document_id, fridge_id, fridge_name, 
                             temp_01am, status_01am, temp_04am, status_04am,
                             temp_07am, status_07am, temp_10am, status_10am,
                             temp_01pm, status_01pm, temp_04pm, status_04pm,
                             temp_07pm, status_07pm, temp_10pm, status_10pm,
                             corrective_action)
                            VALUES 
                            (@document_id, @fridge_id, @fridge_name,
                             @temp_01am, @status_01am, @temp_04am, @status_04am,
                             @temp_07am, @status_07am, @temp_10am, @status_10am,
                             @temp_01pm, @status_01pm, @temp_04pm, @status_04pm,
                             @temp_07pm, @status_07pm, @temp_10pm, @status_10pm,
                             @corrective_action)`);
            }
        }
        
        res.json({ success: true, document_number: documentNumber, document_id: documentId });
    } catch (err) {
        console.error('Error saving document:', err);
        res.status(500).json({ error: 'Failed to save document' });
    }
});

// Delete document
router.delete('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        
        // Delete readings first
        await pool.request()
            .input('document_id', sql.Int, req.params.id)
            .query('DELETE FROM FridgeTempReadings WHERE document_id = @document_id');
        
        // Delete document
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM FridgeTempDocuments WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ==========================================
// API Routes - Settings
// ==========================================

// Get all settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
            .query(`
                SELECT setting_key, setting_value
                FROM FridgeTempSettings
            `);
        
        // Convert to object
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update settings (batch)
router.put('/api/settings', async (req, res) => {
    try {
        const pool = await getPool();
        
        // Update each setting
        for (const [key, value] of Object.entries(req.body)) {
            // Check if setting exists
            const existsResult = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT id FROM FridgeTempSettings WHERE setting_key = @key');
            
            if (existsResult.recordset.length > 0) {
                // Update existing
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`
                        UPDATE FridgeTempSettings 
                        SET setting_value = @value, updated_at = GETDATE()
                        WHERE setting_key = @key
                    `);
            } else {
                // Insert new
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`
                        INSERT INTO FridgeTempSettings (setting_key, setting_value)
                        VALUES (@key, @value)
                    `);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
