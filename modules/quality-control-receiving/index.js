/**
 * Quality Control Receiving Checklist Module
 * Form 13: Track product receiving and storage quality control
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

// Calculate duration between receiving and storage times in minutes
function calculateDuration(receivingTime, storageTime) {
    if (!receivingTime || !storageTime) return null;
    
    const [recHour, recMin] = receivingTime.split(':').map(Number);
    const [stoHour, stoMin] = storageTime.split(':').map(Number);
    
    const recMinutes = recHour * 60 + recMin;
    let stoMinutes = stoHour * 60 + stoMin;
    
    // Handle overnight storage (if storage time is earlier, assume next day)
    if (stoMinutes < recMinutes) {
        stoMinutes += 24 * 60;
    }
    
    return stoMinutes - recMinutes;
}

// Convert time string (HH:mm or HH:mm:ss or HH:mm:ss.0000000) to a format SQL Server can accept
function formatTimeForSQL(timeStr) {
    if (!timeStr || timeStr === 'null' || timeStr === 'undefined' || timeStr === '') {
        return null;
    }
    
    // Handle different time formats
    let cleanTime = String(timeStr).trim();
    
    // If empty after trim, return null
    if (!cleanTime) return null;
    
    // If it's just HH:mm, add seconds
    if (/^\d{2}:\d{2}$/.test(cleanTime)) {
        return cleanTime + ':00';
    }
    
    // If it has milliseconds like "18:54:00.0000000", trim to HH:mm:ss
    if (cleanTime.includes('.')) {
        cleanTime = cleanTime.split('.')[0];
    }
    
    // If it's longer than 8 chars, take first 8
    if (cleanTime.length > 8) {
        cleanTime = cleanTime.substring(0, 8);
    }
    
    // If it's HH:mm:ss format, return as is
    if (/^\d{2}:\d{2}:\d{2}$/.test(cleanTime)) {
        return cleanTime;
    }
    
    console.log('formatTimeForSQL: unexpected format, input=', timeStr, 'output=', cleanTime);
    return cleanTime || null;
}

// Disable caching for API responses
router.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ==========================================
// Serve Static Pages (with no-cache headers)
// ==========================================

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('ETag', Date.now().toString());
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.get('/form', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('ETag', Date.now().toString());
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

router.get('/history', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '-1');
    res.set('Surrogate-Control', 'no-store');
    res.set('ETag', Date.now().toString());
    res.set('Last-Modified', new Date().toUTCString());
    res.sendFile(path.join(__dirname, 'views', 'history.html'));
});

router.get('/settings', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('ETag', Date.now().toString());
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// ==========================================
// API: Current User
// ==========================================

router.get('/api/current-user', (req, res) => {
    console.log('Current user request, req.currentUser:', req.currentUser);
    if (req.currentUser) {
        const userData = {
            name: req.currentUser.displayName || req.currentUser.name,
            email: req.currentUser.email,
            role: req.currentUser.role
        };
        console.log('Returning user data:', userData);
        res.json(userData);
    } else {
        console.log('No currentUser found, returning Unknown User');
        res.json({ name: 'Unknown User', email: '', role: 'User' });
    }
});

// ==========================================
// Supplier Management APIs
// ==========================================

// Get all suppliers
router.get('/api/suppliers', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM QCR_Suppliers WHERE is_active = 1 ORDER BY supplier_name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
});

// Add supplier
router.post('/api/suppliers', async (req, res) => {
    try {
        const { supplier_name, contact_info } = req.body;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('supplier_name', sql.NVarChar, supplier_name)
            .input('contact_info', sql.NVarChar, contact_info || null)
            .query(`INSERT INTO QCR_Suppliers (supplier_name, contact_info) 
                    OUTPUT INSERTED.* 
                    VALUES (@supplier_name, @contact_info)`);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding supplier:', err);
        res.status(500).json({ error: 'Failed to add supplier' });
    }
});

// Update supplier
router.put('/api/suppliers/:id', async (req, res) => {
    try {
        const { supplier_name, contact_info } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('supplier_name', sql.NVarChar, supplier_name)
            .input('contact_info', sql.NVarChar, contact_info || null)
            .query(`UPDATE QCR_Suppliers SET 
                    supplier_name = @supplier_name, 
                    contact_info = @contact_info,
                    updated_at = GETDATE()
                    WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating supplier:', err);
        res.status(500).json({ error: 'Failed to update supplier' });
    }
});

// Delete supplier (soft delete)
router.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE QCR_Suppliers SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting supplier:', err);
        res.status(500).json({ error: 'Failed to delete supplier' });
    }
});

// ==========================================
// Products API (for filter dropdown)
// ==========================================

// Get distinct product names from entries
router.get('/api/products', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT DISTINCT product_name FROM QCR_Entries WHERE product_name IS NOT NULL ORDER BY product_name');
        res.json(result.recordset.map(r => r.product_name));
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// ==========================================
// Food Category Management APIs
// ==========================================

// Get all food categories
router.get('/api/food-categories', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM QCR_FoodCategories WHERE is_active = 1 ORDER BY category_name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching food categories:', err);
        res.status(500).json({ error: 'Failed to fetch food categories' });
    }
});

// Add food category
router.post('/api/food-categories', async (req, res) => {
    try {
        const { category_name, min_temp, max_temp } = req.body;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('category_name', sql.NVarChar, category_name)
            .input('min_temp', sql.Decimal(5, 2), min_temp)
            .input('max_temp', sql.Decimal(5, 2), max_temp)
            .query(`INSERT INTO QCR_FoodCategories (category_name, min_temp, max_temp) 
                    OUTPUT INSERTED.* 
                    VALUES (@category_name, @min_temp, @max_temp)`);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding food category:', err);
        res.status(500).json({ error: 'Failed to add food category' });
    }
});

// Update food category
router.put('/api/food-categories/:id', async (req, res) => {
    try {
        const { category_name, min_temp, max_temp } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('category_name', sql.NVarChar, category_name)
            .input('min_temp', sql.Decimal(5, 2), min_temp)
            .input('max_temp', sql.Decimal(5, 2), max_temp)
            .query(`UPDATE QCR_FoodCategories SET 
                    category_name = @category_name, 
                    min_temp = @min_temp,
                    max_temp = @max_temp,
                    updated_at = GETDATE()
                    WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating food category:', err);
        res.status(500).json({ error: 'Failed to update food category' });
    }
});

// Delete food category (soft delete)
router.delete('/api/food-categories/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE QCR_FoodCategories SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting food category:', err);
        res.status(500).json({ error: 'Failed to delete food category' });
    }
});

// ==========================================
// Document APIs
// ==========================================

// Get all documents (history)
router.get('/api/documents', async (req, res) => {
    try {
        const { date, status, startDate, endDate, supplier_id, product_name } = req.query;
        const pool = await getPool();
        
        let query = `SELECT d.*, 
                     (SELECT COUNT(*) FROM QCR_Entries WHERE document_id = d.id) as entry_count
                     FROM QCR_Documents d WHERE 1=1`;
        const request = pool.request();
        
        if (date) {
            query += ' AND d.log_date = @date';
            request.input('date', sql.Date, date);
        }
        
        if (startDate && endDate) {
            query += ' AND d.log_date BETWEEN @startDate AND @endDate';
            request.input('startDate', sql.Date, startDate);
            request.input('endDate', sql.Date, endDate);
        }
        
        if (status) {
            query += ' AND d.status = @status';
            request.input('status', sql.NVarChar, status);
        }
        
        // Filter by supplier - find documents that have entries with this supplier
        if (supplier_id) {
            query += ' AND EXISTS (SELECT 1 FROM QCR_Entries e WHERE e.document_id = d.id AND e.supplier_id = @supplier_id)';
            request.input('supplier_id', sql.Int, supplier_id);
        }
        
        // Filter by product name - find documents that have entries with matching product name
        if (product_name) {
            query += ' AND EXISTS (SELECT 1 FROM QCR_Entries e WHERE e.document_id = d.id AND e.product_name LIKE @product_name)';
            request.input('product_name', sql.NVarChar, '%' + product_name + '%');
        }
        
        query += ' ORDER BY d.log_date DESC, d.created_at DESC';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Check if document exists for date
router.get('/api/documents/check', async (req, res) => {
    try {
        const { date } = req.query;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('date', sql.Date, date)
            .query(`SELECT * FROM QCR_Documents WHERE log_date = @date`);
        
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

// Get single document with entries
router.get('/api/documents/:id', async (req, res) => {
    try {
        console.log('GET /api/documents/:id called with id:', req.params.id);
        const pool = await getPool();
        
        const docResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM QCR_Documents WHERE id = @id');
        
        console.log('Document result:', docResult.recordset);
        
        if (docResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const entriesResult = await pool.request()
            .input('document_id', sql.Int, req.params.id)
            .query(`SELECT e.*, s.supplier_name as supplier_display_name
                    FROM QCR_Entries e 
                    LEFT JOIN QCR_Suppliers s ON e.supplier_id = s.id
                    WHERE e.document_id = @document_id 
                    ORDER BY e.receiving_time`);
        
        console.log('Entries result count:', entriesResult.recordset.length);
        
        res.json({
            document: docResult.recordset[0],
            entries: entriesResult.recordset
        });
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// Create new document
router.post('/api/documents', async (req, res) => {
    try {
        const { log_date, filled_by } = req.body;
        const pool = await getPool();
        
        // Check if document already exists for this date
        const existingDoc = await pool.request()
            .input('date', sql.Date, log_date)
            .query('SELECT * FROM QCR_Documents WHERE log_date = @date');
        
        if (existingDoc.recordset.length > 0) {
            return res.json({ exists: true, document: existingDoc.recordset[0] });
        }
        
        // Generate document number: QCR-YYYYMMDD-001
        const dateStr = new Date(log_date).toISOString().split('T')[0].replace(/-/g, '');
        const documentNumber = `QCR-${dateStr}-001`;
        
        const insertResult = await pool.request()
            .input('document_number', sql.NVarChar, documentNumber)
            .input('log_date', sql.Date, log_date)
            .input('filled_by', sql.NVarChar, filled_by)
            .query(`INSERT INTO QCR_Documents (document_number, log_date, filled_by) 
                    OUTPUT INSERTED.* 
                    VALUES (@document_number, @log_date, @filled_by)`);
        
        res.json({ exists: false, document: insertResult.recordset[0] });
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: 'Failed to create document' });
    }
});

// Update document status
router.put('/api/documents/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.NVarChar, status)
            .query('UPDATE QCR_Documents SET status = @status, updated_at = GETDATE() WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating document status:', err);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

// Verify document
router.post('/api/documents/:id/verify', async (req, res) => {
    try {
        const verifiedBy = req.currentUser?.displayName || req.currentUser?.name || 'Unknown';
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by', sql.NVarChar, verifiedBy)
            .query(`UPDATE QCR_Documents 
                    SET is_verified = 1, verified_by = @verified_by, verified_at = GETDATE(), updated_at = GETDATE() 
                    WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error verifying document:', err);
        res.status(500).json({ error: 'Failed to verify document' });
    }
});

// Delete document
router.delete('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        
        // First delete entries
        await pool.request()
            .input('document_id', sql.Int, req.params.id)
            .query('DELETE FROM QCR_Entries WHERE document_id = @document_id');
        
        // Then delete document
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM QCR_Documents WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ==========================================
// Entry APIs (Individual product records)
// ==========================================

// Get entries for a document
router.get('/api/entries', async (req, res) => {
    try {
        const { document_id } = req.query;
        console.log('Fetching entries for document_id:', document_id);
        
        const pool = await getPool();
        
        const result = await pool.request()
            .input('document_id', sql.Int, document_id)
            .query(`SELECT e.*, s.supplier_name as supplier_display_name
                    FROM QCR_Entries e 
                    LEFT JOIN QCR_Suppliers s ON e.supplier_id = s.id
                    WHERE e.document_id = @document_id 
                    ORDER BY e.receiving_time`);
        
        console.log('Entries found:', result.recordset.length);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching entries:', err);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

// Add new entry
router.post('/api/entries', async (req, res) => {
    try {
        const {
            document_id,
            product_name,
            food_category_id,
            production_date,
            product_expiry_date,
            supplier_name,
            receiving_time,
            receiving_temp,
            receiving_area_clean,
            product_well_covered,
            pack_opened_inspected,
            no_physical_hazards,
            truck_cleanliness,
            storage_time,
            comments,
            corrective_action,
            quality_controller_signature,
            entry_status
        } = req.body;
        
        const pool = await getPool();
        
        // Calculate duration
        const duration_minutes = calculateDuration(receiving_time, storage_time);
        
        // Determine overall status
        const allChecks = receiving_area_clean && product_well_covered && 
                          pack_opened_inspected && no_physical_hazards && truck_cleanliness;
        const overall_status = allChecks ? 'Pass' : 'Needs Review';
        
        const result = await pool.request()
            .input('document_id', sql.Int, document_id)
            .input('product_name', sql.NVarChar, product_name)
            .input('food_category_id', sql.Int, food_category_id || null)
            .input('production_date', sql.Date, production_date || null)
            .input('product_expiry_date', sql.Date, product_expiry_date || null)
            .input('supplier_name', sql.NVarChar, supplier_name || null)
            .input('receiving_time', sql.NVarChar, formatTimeForSQL(receiving_time))
            .input('receiving_temp', sql.Decimal(5, 2), receiving_temp || null)
            .input('receiving_area_clean', sql.Bit, receiving_area_clean ? 1 : 0)
            .input('product_well_covered', sql.Bit, product_well_covered ? 1 : 0)
            .input('pack_opened_inspected', sql.Bit, pack_opened_inspected ? 1 : 0)
            .input('no_physical_hazards', sql.Bit, no_physical_hazards ? 1 : 0)
            .input('truck_cleanliness', sql.Bit, truck_cleanliness ? 1 : 0)
            .input('storage_time', sql.NVarChar, formatTimeForSQL(storage_time))
            .input('duration_minutes', sql.Int, duration_minutes)
            .input('comments', sql.NVarChar, comments || null)
            .input('corrective_action', sql.NVarChar, corrective_action || null)
            .input('quality_controller_signature', sql.NVarChar, quality_controller_signature || null)
            .input('signature_timestamp', sql.DateTime, quality_controller_signature ? new Date() : null)
            .input('overall_status', sql.NVarChar, overall_status)
            .input('entry_status', sql.NVarChar, entry_status || 'submitted')
            .query(`INSERT INTO QCR_Entries (
                        document_id, product_name, food_category_id, production_date, product_expiry_date, supplier_name,
                        receiving_time, receiving_temp, receiving_area_clean, product_well_covered,
                        pack_opened_inspected, no_physical_hazards, truck_cleanliness, storage_time,
                        duration_minutes, comments, corrective_action, quality_controller_signature,
                        signature_timestamp, overall_status, entry_status
                    ) 
                    OUTPUT INSERTED.* 
                    VALUES (
                        @document_id, @product_name, @food_category_id, @production_date, @product_expiry_date, @supplier_name,
                        TRY_CAST(@receiving_time AS TIME), @receiving_temp, @receiving_area_clean, @product_well_covered,
                        @pack_opened_inspected, @no_physical_hazards, @truck_cleanliness, TRY_CAST(@storage_time AS TIME),
                        @duration_minutes, @comments, @corrective_action, @quality_controller_signature,
                        @signature_timestamp, @overall_status, @entry_status
                    )`);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding entry:', err);
        res.status(500).json({ error: 'Failed to add entry' });
    }
});

// Update entry
router.put('/api/entries/:id', async (req, res) => {
    try {
        console.log('PUT /api/entries/:id called with id:', req.params.id);
        console.log('Request body:', req.body);
        
        const {
            product_name,
            production_date,
            product_expiry_date,
            supplier_name,
            food_category_id,
            receiving_time,
            receiving_temp,
            receiving_area_clean,
            product_well_covered,
            pack_opened_inspected,
            no_physical_hazards,
            truck_cleanliness,
            storage_time,
            comments,
            corrective_action,
            quality_controller_signature,
            entry_status
        } = req.body;
        
        const pool = await getPool();
        
        // Calculate duration
        const duration_minutes = calculateDuration(receiving_time, storage_time);
        
        // Determine overall status
        const allChecks = receiving_area_clean && product_well_covered && 
                          pack_opened_inspected && no_physical_hazards && truck_cleanliness;
        const overall_status = allChecks ? 'Pass' : 'Needs Review';
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('product_name', sql.NVarChar, product_name)
            .input('production_date', sql.Date, production_date || null)
            .input('product_expiry_date', sql.Date, product_expiry_date || null)
            .input('supplier_name', sql.NVarChar, supplier_name || null)
            .input('food_category_id', sql.Int, food_category_id || null)
            .input('receiving_time', sql.NVarChar, formatTimeForSQL(receiving_time))
            .input('receiving_temp', sql.Decimal(5, 2), receiving_temp || null)
            .input('receiving_area_clean', sql.Bit, receiving_area_clean ? 1 : 0)
            .input('product_well_covered', sql.Bit, product_well_covered ? 1 : 0)
            .input('pack_opened_inspected', sql.Bit, pack_opened_inspected ? 1 : 0)
            .input('no_physical_hazards', sql.Bit, no_physical_hazards ? 1 : 0)
            .input('truck_cleanliness', sql.Bit, truck_cleanliness ? 1 : 0)
            .input('storage_time', sql.NVarChar, formatTimeForSQL(storage_time))
            .input('duration_minutes', sql.Int, duration_minutes)
            .input('comments', sql.NVarChar, comments || null)
            .input('corrective_action', sql.NVarChar, corrective_action || null)
            .input('quality_controller_signature', sql.NVarChar, quality_controller_signature || null)
            .input('signature_timestamp', sql.DateTime, quality_controller_signature ? new Date() : null)
            .input('overall_status', sql.NVarChar, overall_status)
            .input('entry_status', sql.NVarChar, entry_status || 'submitted')
            .query(`UPDATE QCR_Entries SET 
                    product_name = @product_name,
                    production_date = @production_date,
                    product_expiry_date = @product_expiry_date,
                    supplier_name = @supplier_name,
                    food_category_id = @food_category_id,
                    receiving_time = TRY_CAST(@receiving_time AS TIME),
                    receiving_temp = @receiving_temp,
                    receiving_area_clean = @receiving_area_clean,
                    product_well_covered = @product_well_covered,
                    pack_opened_inspected = @pack_opened_inspected,
                    no_physical_hazards = @no_physical_hazards,
                    truck_cleanliness = @truck_cleanliness,
                    storage_time = TRY_CAST(@storage_time AS TIME),
                    duration_minutes = @duration_minutes,
                    comments = @comments,
                    corrective_action = @corrective_action,
                    quality_controller_signature = @quality_controller_signature,
                    signature_timestamp = @signature_timestamp,
                    overall_status = @overall_status,
                    entry_status = @entry_status,
                    updated_at = GETDATE()
                    WHERE id = @id`);
        
        console.log('Entry updated successfully, id:', req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating entry:', err);
        res.status(500).json({ error: 'Failed to update entry: ' + err.message });
    }
});

// Delete entry
router.delete('/api/entries/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM QCR_Entries WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting entry:', err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// Sign entry
router.post('/api/entries/:id/sign', async (req, res) => {
    try {
        const { signature } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('signature', sql.NVarChar, signature)
            .input('timestamp', sql.DateTime, new Date())
            .query(`UPDATE QCR_Entries SET 
                    quality_controller_signature = @signature,
                    signature_timestamp = @timestamp,
                    updated_at = GETDATE()
                    WHERE id = @id`);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error signing entry:', err);
        res.status(500).json({ error: 'Failed to sign entry' });
    }
});

// ==========================================
// Settings APIs
// ==========================================

// Get settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT setting_key, setting_value FROM QCRSettings
        `);
        
        // Convert to object
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
        const pool = await getPool();
        
        for (const [key, value] of Object.entries(req.body)) {
            const existsResult = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT id FROM QCRSettings WHERE setting_key = @key');
            
            if (existsResult.recordset.length > 0) {
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`UPDATE QCRSettings SET setting_value = @value WHERE setting_key = @key`);
            } else {
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`INSERT INTO QCRSettings (setting_key, setting_value) VALUES (@key, @value)`);
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

module.exports = router;
