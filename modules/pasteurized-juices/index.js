/**
 * Pasteurized Juices Checklist Module
 * Track pasteurized juices quality control
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

// Disable caching for API responses
router.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ==========================================
// Serve Static Pages
// ==========================================

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.get('/form', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'form.html'));
});

router.get('/history', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'history.html'));
});

router.get('/settings', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// ==========================================
// API: Current User
// ==========================================

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

// ==========================================
// Settings APIs
// ==========================================

// Get all settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT setting_key, setting_value FROM PJC_Settings');
        
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        settings.last_revision_date = settings.last_revision || settings.last_revision_date;
        settings.company_name = settings.reference || settings.company_name;
        
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
        const settings = req.body;
        
        for (const [key, value] of Object.entries(settings)) {
            await pool.request()
                .input('key', sql.NVarChar, key)
                .input('value', sql.NVarChar, value)
                .query(`
                    IF EXISTS (SELECT 1 FROM PJC_Settings WHERE setting_key = @key)
                        UPDATE PJC_Settings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO PJC_Settings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// Products APIs
// ==========================================

// Get all products
router.get('/api/products', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM PJC_Products WHERE is_active = 1 ORDER BY sort_order, product_name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Add product
router.post('/api/products', async (req, res) => {
    try {
        const { product_name, product_code } = req.body;
        const pool = await getPool();
        
        const sortResult = await pool.request()
            .query('SELECT ISNULL(MAX(sort_order), 0) + 1 as next_order FROM PJC_Products');
        
        const result = await pool.request()
            .input('product_name', sql.NVarChar, product_name)
            .input('product_code', sql.NVarChar, product_code || null)
            .input('sort_order', sql.Int, sortResult.recordset[0].next_order)
            .query(`
                INSERT INTO PJC_Products (product_name, product_code, sort_order)
                OUTPUT INSERTED.*
                VALUES (@product_name, @product_code, @sort_order)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// Update product
router.put('/api/products/:id', async (req, res) => {
    try {
        const { product_name, product_code } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('product_name', sql.NVarChar, product_name)
            .input('product_code', sql.NVarChar, product_code || null)
            .query(`
                UPDATE PJC_Products SET
                    product_name = @product_name,
                    product_code = @product_code,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product (soft delete)
router.delete('/api/products/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE PJC_Products SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ==========================================
// Document APIs
// ==========================================

// Generate document number
function generateDocumentNumber(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `PJC-${year}${month}${day}-001`;
}

// Get documents (with filters)
router.get('/api/documents', async (req, res) => {
    try {
        const { date, from, to, status, product_id } = req.query;
        const pool = await getPool();
        
        let query = `
            SELECT d.*
            FROM PJC_Documents d
            WHERE 1=1
        `;
        
        const request = pool.request();
        
        if (date) {
            query += ' AND d.date_of_preparation = @date';
            request.input('date', sql.Date, date);
        }
        
        if (from) {
            query += ' AND d.date_of_preparation >= @from';
            request.input('from', sql.Date, from);
        }
        
        if (to) {
            query += ' AND d.date_of_preparation <= @to';
            request.input('to', sql.Date, to);
        }
        
        if (status) {
            query += ' AND d.status = @status';
            request.input('status', sql.NVarChar, status);
        }
        
        if (product_id) {
            query += ' AND d.product_id = @product_id';
            request.input('product_id', sql.Int, product_id);
        }
        
        query += ' ORDER BY d.date_of_preparation DESC, d.created_at DESC';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Get single document
router.get('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        
        const docResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM PJC_Documents WHERE id = @id');
        
        if (docResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        res.json(docResult.recordset[0]);
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// Create document
router.post('/api/documents', async (req, res) => {
    try {
        const { 
            filled_by, date_of_preparation, product_id, product_name, comments,
            // Fruit Preparation
            fruits_correctly_sorted, fruits_correctly_sorted_action,
            fruits_properly_disinfected, fruits_properly_disinfected_action,
            proper_strainers_used, proper_strainers_used_action,
            strainers_good_condition, strainers_good_condition_action,
            juice_properly_strained, juice_properly_strained_action,
            quality_before_pasteurization, quality_before_pasteurization_action,
            // Thermobuttons & Vacuum
            thermobuttons_good_condition, thermobuttons_good_condition_action,
            vacuum_done_properly, vacuum_done_properly_action,
            vacuum_prog, vacuum_percent, vacuum_sealing_time, vacuum_pressure,
            // Pasteurization
            date_of_pasteurization, oven_steam_mode, oven_steam_mode_action,
            heat_start_time, heat_finish_time,
            cooling_start_time, cooling_finish_time,
            pasteurization_proper, pasteurization_proper_action,
            // Temperature
            temp_after_cooling_ok, temp_after_cooling_value,
            // Final Quality
            quality_after_pasteurization, quality_after_pasteurization_action,
            expiry_date_correct, expiry_date_correct_action,
            labelling_correct, labelling_correct_action,
            retention_sample_taken, retention_sample_taken_action
        } = req.body;
        
        const pool = await getPool();
        
        // Generate unique document number
        let docNumber = generateDocumentNumber(date_of_preparation);
        
        const existingResult = await pool.request()
            .input('prefix', sql.NVarChar, docNumber.substring(0, docNumber.length - 3) + '%')
            .query('SELECT document_number FROM PJC_Documents WHERE document_number LIKE @prefix ORDER BY document_number DESC');
        
        if (existingResult.recordset.length > 0) {
            const lastNum = existingResult.recordset[0].document_number;
            const lastSeq = parseInt(lastNum.slice(-3));
            docNumber = docNumber.substring(0, docNumber.length - 3) + String(lastSeq + 1).padStart(3, '0');
        }
        
        const result = await pool.request()
            .input('document_number', sql.NVarChar, docNumber)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('date_of_preparation', sql.Date, date_of_preparation)
            .input('product_id', sql.Int, product_id)
            .input('product_name', sql.NVarChar, product_name)
            .input('comments', sql.NVarChar, comments || null)
            // Fruit Preparation
            .input('fruits_correctly_sorted', sql.Bit, fruits_correctly_sorted)
            .input('fruits_correctly_sorted_action', sql.NVarChar, fruits_correctly_sorted_action || null)
            .input('fruits_properly_disinfected', sql.Bit, fruits_properly_disinfected)
            .input('fruits_properly_disinfected_action', sql.NVarChar, fruits_properly_disinfected_action || null)
            .input('proper_strainers_used', sql.Bit, proper_strainers_used)
            .input('proper_strainers_used_action', sql.NVarChar, proper_strainers_used_action || null)
            .input('strainers_good_condition', sql.Bit, strainers_good_condition)
            .input('strainers_good_condition_action', sql.NVarChar, strainers_good_condition_action || null)
            .input('juice_properly_strained', sql.Bit, juice_properly_strained)
            .input('juice_properly_strained_action', sql.NVarChar, juice_properly_strained_action || null)
            .input('quality_before_pasteurization', sql.Bit, quality_before_pasteurization)
            .input('quality_before_pasteurization_action', sql.NVarChar, quality_before_pasteurization_action || null)
            // Thermobuttons & Vacuum
            .input('thermobuttons_good_condition', sql.Bit, thermobuttons_good_condition)
            .input('thermobuttons_good_condition_action', sql.NVarChar, thermobuttons_good_condition_action || null)
            .input('vacuum_done_properly', sql.Bit, vacuum_done_properly)
            .input('vacuum_done_properly_action', sql.NVarChar, vacuum_done_properly_action || null)
            .input('vacuum_prog', sql.NVarChar, vacuum_prog || '10')
            .input('vacuum_percent', sql.NVarChar, vacuum_percent || '20%')
            .input('vacuum_sealing_time', sql.NVarChar, vacuum_sealing_time || '3 sec')
            .input('vacuum_pressure', sql.NVarChar, vacuum_pressure || '-1 bar')
            // Pasteurization
            .input('date_of_pasteurization', sql.Date, date_of_pasteurization || null)
            .input('oven_steam_mode', sql.Bit, oven_steam_mode)
            .input('oven_steam_mode_action', sql.NVarChar, oven_steam_mode_action || null)
            .input('heat_start_time', sql.Time, heat_start_time || null)
            .input('heat_finish_time', sql.Time, heat_finish_time || null)
            .input('cooling_start_time', sql.Time, cooling_start_time || null)
            .input('cooling_finish_time', sql.Time, cooling_finish_time || null)
            .input('pasteurization_proper', sql.Bit, pasteurization_proper)
            .input('pasteurization_proper_action', sql.NVarChar, pasteurization_proper_action || null)
            // Temperature
            .input('temp_after_cooling_ok', sql.Bit, temp_after_cooling_ok)
            .input('temp_after_cooling_value', sql.Decimal(5, 2), temp_after_cooling_value || null)
            // Final Quality
            .input('quality_after_pasteurization', sql.Bit, quality_after_pasteurization)
            .input('quality_after_pasteurization_action', sql.NVarChar, quality_after_pasteurization_action || null)
            .input('expiry_date_correct', sql.Bit, expiry_date_correct)
            .input('expiry_date_correct_action', sql.NVarChar, expiry_date_correct_action || null)
            .input('labelling_correct', sql.Bit, labelling_correct)
            .input('labelling_correct_action', sql.NVarChar, labelling_correct_action || null)
            .input('retention_sample_taken', sql.Bit, retention_sample_taken)
            .input('retention_sample_taken_action', sql.NVarChar, retention_sample_taken_action || null)
            .query(`
                INSERT INTO PJC_Documents (
                    document_number, filled_by, date_of_preparation, product_id, product_name, comments,
                    fruits_correctly_sorted, fruits_correctly_sorted_action,
                    fruits_properly_disinfected, fruits_properly_disinfected_action,
                    proper_strainers_used, proper_strainers_used_action,
                    strainers_good_condition, strainers_good_condition_action,
                    juice_properly_strained, juice_properly_strained_action,
                    quality_before_pasteurization, quality_before_pasteurization_action,
                    thermobuttons_good_condition, thermobuttons_good_condition_action,
                    vacuum_done_properly, vacuum_done_properly_action,
                    vacuum_prog, vacuum_percent, vacuum_sealing_time, vacuum_pressure,
                    date_of_pasteurization, oven_steam_mode, oven_steam_mode_action,
                    heat_start_time, heat_finish_time, cooling_start_time, cooling_finish_time,
                    pasteurization_proper, pasteurization_proper_action,
                    temp_after_cooling_ok, temp_after_cooling_value,
                    quality_after_pasteurization, quality_after_pasteurization_action,
                    expiry_date_correct, expiry_date_correct_action,
                    labelling_correct, labelling_correct_action,
                    retention_sample_taken, retention_sample_taken_action
                )
                OUTPUT INSERTED.*
                VALUES (
                    @document_number, @filled_by, @date_of_preparation, @product_id, @product_name, @comments,
                    @fruits_correctly_sorted, @fruits_correctly_sorted_action,
                    @fruits_properly_disinfected, @fruits_properly_disinfected_action,
                    @proper_strainers_used, @proper_strainers_used_action,
                    @strainers_good_condition, @strainers_good_condition_action,
                    @juice_properly_strained, @juice_properly_strained_action,
                    @quality_before_pasteurization, @quality_before_pasteurization_action,
                    @thermobuttons_good_condition, @thermobuttons_good_condition_action,
                    @vacuum_done_properly, @vacuum_done_properly_action,
                    @vacuum_prog, @vacuum_percent, @vacuum_sealing_time, @vacuum_pressure,
                    @date_of_pasteurization, @oven_steam_mode, @oven_steam_mode_action,
                    @heat_start_time, @heat_finish_time, @cooling_start_time, @cooling_finish_time,
                    @pasteurization_proper, @pasteurization_proper_action,
                    @temp_after_cooling_ok, @temp_after_cooling_value,
                    @quality_after_pasteurization, @quality_after_pasteurization_action,
                    @expiry_date_correct, @expiry_date_correct_action,
                    @labelling_correct, @labelling_correct_action,
                    @retention_sample_taken, @retention_sample_taken_action
                )
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating document:', err);
        res.status(500).json({ error: 'Failed to create document' });
    }
});

// Update document
router.put('/api/documents/:id', async (req, res) => {
    try {
        const { 
            comments, status,
            // Fruit Preparation
            fruits_correctly_sorted, fruits_correctly_sorted_action,
            fruits_properly_disinfected, fruits_properly_disinfected_action,
            proper_strainers_used, proper_strainers_used_action,
            strainers_good_condition, strainers_good_condition_action,
            juice_properly_strained, juice_properly_strained_action,
            quality_before_pasteurization, quality_before_pasteurization_action,
            // Thermobuttons & Vacuum
            thermobuttons_good_condition, thermobuttons_good_condition_action,
            vacuum_done_properly, vacuum_done_properly_action,
            vacuum_prog, vacuum_percent, vacuum_sealing_time, vacuum_pressure,
            // Pasteurization
            date_of_pasteurization, oven_steam_mode, oven_steam_mode_action,
            heat_start_time, heat_finish_time,
            cooling_start_time, cooling_finish_time,
            pasteurization_proper, pasteurization_proper_action,
            // Temperature
            temp_after_cooling_ok, temp_after_cooling_value,
            // Final Quality
            quality_after_pasteurization, quality_after_pasteurization_action,
            expiry_date_correct, expiry_date_correct_action,
            labelling_correct, labelling_correct_action,
            retention_sample_taken, retention_sample_taken_action
        } = req.body;
        
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('comments', sql.NVarChar, comments || null)
            .input('status', sql.NVarChar, status || 'Active')
            // Fruit Preparation
            .input('fruits_correctly_sorted', sql.Bit, fruits_correctly_sorted)
            .input('fruits_correctly_sorted_action', sql.NVarChar, fruits_correctly_sorted_action || null)
            .input('fruits_properly_disinfected', sql.Bit, fruits_properly_disinfected)
            .input('fruits_properly_disinfected_action', sql.NVarChar, fruits_properly_disinfected_action || null)
            .input('proper_strainers_used', sql.Bit, proper_strainers_used)
            .input('proper_strainers_used_action', sql.NVarChar, proper_strainers_used_action || null)
            .input('strainers_good_condition', sql.Bit, strainers_good_condition)
            .input('strainers_good_condition_action', sql.NVarChar, strainers_good_condition_action || null)
            .input('juice_properly_strained', sql.Bit, juice_properly_strained)
            .input('juice_properly_strained_action', sql.NVarChar, juice_properly_strained_action || null)
            .input('quality_before_pasteurization', sql.Bit, quality_before_pasteurization)
            .input('quality_before_pasteurization_action', sql.NVarChar, quality_before_pasteurization_action || null)
            // Thermobuttons & Vacuum
            .input('thermobuttons_good_condition', sql.Bit, thermobuttons_good_condition)
            .input('thermobuttons_good_condition_action', sql.NVarChar, thermobuttons_good_condition_action || null)
            .input('vacuum_done_properly', sql.Bit, vacuum_done_properly)
            .input('vacuum_done_properly_action', sql.NVarChar, vacuum_done_properly_action || null)
            .input('vacuum_prog', sql.NVarChar, vacuum_prog || '10')
            .input('vacuum_percent', sql.NVarChar, vacuum_percent || '20%')
            .input('vacuum_sealing_time', sql.NVarChar, vacuum_sealing_time || '3 sec')
            .input('vacuum_pressure', sql.NVarChar, vacuum_pressure || '-1 bar')
            // Pasteurization
            .input('date_of_pasteurization', sql.Date, date_of_pasteurization || null)
            .input('oven_steam_mode', sql.Bit, oven_steam_mode)
            .input('oven_steam_mode_action', sql.NVarChar, oven_steam_mode_action || null)
            .input('heat_start_time', sql.Time, heat_start_time || null)
            .input('heat_finish_time', sql.Time, heat_finish_time || null)
            .input('cooling_start_time', sql.Time, cooling_start_time || null)
            .input('cooling_finish_time', sql.Time, cooling_finish_time || null)
            .input('pasteurization_proper', sql.Bit, pasteurization_proper)
            .input('pasteurization_proper_action', sql.NVarChar, pasteurization_proper_action || null)
            // Temperature
            .input('temp_after_cooling_ok', sql.Bit, temp_after_cooling_ok)
            .input('temp_after_cooling_value', sql.Decimal(5, 2), temp_after_cooling_value || null)
            // Final Quality
            .input('quality_after_pasteurization', sql.Bit, quality_after_pasteurization)
            .input('quality_after_pasteurization_action', sql.NVarChar, quality_after_pasteurization_action || null)
            .input('expiry_date_correct', sql.Bit, expiry_date_correct)
            .input('expiry_date_correct_action', sql.NVarChar, expiry_date_correct_action || null)
            .input('labelling_correct', sql.Bit, labelling_correct)
            .input('labelling_correct_action', sql.NVarChar, labelling_correct_action || null)
            .input('retention_sample_taken', sql.Bit, retention_sample_taken)
            .input('retention_sample_taken_action', sql.NVarChar, retention_sample_taken_action || null)
            .query(`
                UPDATE PJC_Documents SET
                    comments = @comments,
                    status = @status,
                    fruits_correctly_sorted = @fruits_correctly_sorted,
                    fruits_correctly_sorted_action = @fruits_correctly_sorted_action,
                    fruits_properly_disinfected = @fruits_properly_disinfected,
                    fruits_properly_disinfected_action = @fruits_properly_disinfected_action,
                    proper_strainers_used = @proper_strainers_used,
                    proper_strainers_used_action = @proper_strainers_used_action,
                    strainers_good_condition = @strainers_good_condition,
                    strainers_good_condition_action = @strainers_good_condition_action,
                    juice_properly_strained = @juice_properly_strained,
                    juice_properly_strained_action = @juice_properly_strained_action,
                    quality_before_pasteurization = @quality_before_pasteurization,
                    quality_before_pasteurization_action = @quality_before_pasteurization_action,
                    thermobuttons_good_condition = @thermobuttons_good_condition,
                    thermobuttons_good_condition_action = @thermobuttons_good_condition_action,
                    vacuum_done_properly = @vacuum_done_properly,
                    vacuum_done_properly_action = @vacuum_done_properly_action,
                    vacuum_prog = @vacuum_prog,
                    vacuum_percent = @vacuum_percent,
                    vacuum_sealing_time = @vacuum_sealing_time,
                    vacuum_pressure = @vacuum_pressure,
                    date_of_pasteurization = @date_of_pasteurization,
                    oven_steam_mode = @oven_steam_mode,
                    oven_steam_mode_action = @oven_steam_mode_action,
                    heat_start_time = @heat_start_time,
                    heat_finish_time = @heat_finish_time,
                    cooling_start_time = @cooling_start_time,
                    cooling_finish_time = @cooling_finish_time,
                    pasteurization_proper = @pasteurization_proper,
                    pasteurization_proper_action = @pasteurization_proper_action,
                    temp_after_cooling_ok = @temp_after_cooling_ok,
                    temp_after_cooling_value = @temp_after_cooling_value,
                    quality_after_pasteurization = @quality_after_pasteurization,
                    quality_after_pasteurization_action = @quality_after_pasteurization_action,
                    expiry_date_correct = @expiry_date_correct,
                    expiry_date_correct_action = @expiry_date_correct_action,
                    labelling_correct = @labelling_correct,
                    labelling_correct_action = @labelling_correct_action,
                    retention_sample_taken = @retention_sample_taken,
                    retention_sample_taken_action = @retention_sample_taken_action,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json({ error: 'Failed to update document' });
    }
});

// Delete document
router.delete('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM PJC_Documents WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// Verify document
router.put('/api/documents/:id/verify', async (req, res) => {
    try {
        const pool = await getPool();
        const verifiedBy = req.currentUser ? (req.currentUser.displayName || req.currentUser.name) : 'Unknown';
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by', sql.NVarChar, verifiedBy)
            .query(`
                UPDATE PJC_Documents SET
                    is_verified = 1,
                    verified_by = @verified_by,
                    verified_at = GETDATE(),
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error verifying document:', err);
        res.status(500).json({ error: 'Failed to verify document' });
    }
});

// ==========================================
// Stats API
// ==========================================

router.get('/api/stats', async (req, res) => {
    try {
        const pool = await getPool();
        const today = new Date().toISOString().split('T')[0];
        
        // Get today's count
        const todayResult = await pool.request()
            .input('today', sql.Date, today)
            .query('SELECT COUNT(*) as count FROM PJC_Documents WHERE date_of_preparation = @today');
        
        // Get pending verification count
        const pendingResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM PJC_Documents WHERE is_verified = 0');
        
        // Get this week's verified count
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const verifiedResult = await pool.request()
            .input('weekStart', sql.Date, weekStart.toISOString().split('T')[0])
            .query('SELECT COUNT(*) as count FROM PJC_Documents WHERE is_verified = 1 AND date_of_preparation >= @weekStart');
        
        // Get total products
        const productsResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM PJC_Products WHERE is_active = 1');
        
        res.json({
            todayCount: todayResult.recordset[0].count,
            pendingCount: pendingResult.recordset[0].count,
            verifiedCount: verifiedResult.recordset[0].count,
            totalProducts: productsResult.recordset[0].count
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
