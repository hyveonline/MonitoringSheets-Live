/**
 * End-Product Checklist Module
 * Track end product quality control
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
            .query('SELECT setting_key, setting_value FROM EPC_Settings');
        
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
                    IF EXISTS (SELECT 1 FROM EPC_Settings WHERE setting_key = @key)
                        UPDATE EPC_Settings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO EPC_Settings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// Branches APIs
// ==========================================

// Get all branches
router.get('/api/branches', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM EPC_Branches WHERE is_active = 1 ORDER BY sort_order, branch_name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching branches:', err);
        res.status(500).json({ error: 'Failed to fetch branches' });
    }
});

// Add branch
router.post('/api/branches', async (req, res) => {
    try {
        const { branch_name, branch_code } = req.body;
        const pool = await getPool();
        
        const sortResult = await pool.request()
            .query('SELECT ISNULL(MAX(sort_order), 0) + 1 as next_order FROM EPC_Branches');
        
        const result = await pool.request()
            .input('branch_name', sql.NVarChar, branch_name)
            .input('branch_code', sql.NVarChar, branch_code || null)
            .input('sort_order', sql.Int, sortResult.recordset[0].next_order)
            .query(`
                INSERT INTO EPC_Branches (branch_name, branch_code, sort_order)
                OUTPUT INSERTED.*
                VALUES (@branch_name, @branch_code, @sort_order)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding branch:', err);
        res.status(500).json({ error: 'Failed to add branch' });
    }
});

// Update branch
router.put('/api/branches/:id', async (req, res) => {
    try {
        const { branch_name, branch_code } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('branch_name', sql.NVarChar, branch_name)
            .input('branch_code', sql.NVarChar, branch_code || null)
            .query(`
                UPDATE EPC_Branches SET
                    branch_name = @branch_name,
                    branch_code = @branch_code,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating branch:', err);
        res.status(500).json({ error: 'Failed to update branch' });
    }
});

// Delete branch (soft delete)
router.delete('/api/branches/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE EPC_Branches SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting branch:', err);
        res.status(500).json({ error: 'Failed to delete branch' });
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
            .query('SELECT * FROM EPC_Products WHERE is_active = 1 ORDER BY sort_order, product_name');
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
            .query('SELECT ISNULL(MAX(sort_order), 0) + 1 as next_order FROM EPC_Products');
        
        const result = await pool.request()
            .input('product_name', sql.NVarChar, product_name)
            .input('product_code', sql.NVarChar, product_code || null)
            .input('sort_order', sql.Int, sortResult.recordset[0].next_order)
            .query(`
                INSERT INTO EPC_Products (product_name, product_code, sort_order)
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
                UPDATE EPC_Products SET
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
            .query('UPDATE EPC_Products SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
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
    return `EPC-${year}${month}${day}-001`;
}

// Get documents (with filters)
router.get('/api/documents', async (req, res) => {
    try {
        const { date, from, to, status, branch_id } = req.query;
        const pool = await getPool();
        
        let query = `
            SELECT d.*
            FROM EPC_Documents d
            WHERE 1=1
        `;
        
        const request = pool.request();
        
        if (date) {
            query += ' AND d.log_date = @date';
            request.input('date', sql.Date, date);
        }
        
        if (from) {
            query += ' AND d.log_date >= @from';
            request.input('from', sql.Date, from);
        }
        
        if (to) {
            query += ' AND d.log_date <= @to';
            request.input('to', sql.Date, to);
        }
        
        if (status) {
            query += ' AND d.status = @status';
            request.input('status', sql.NVarChar, status);
        }
        
        if (branch_id) {
            query += ' AND d.branch_id = @branch_id';
            request.input('branch_id', sql.Int, branch_id);
        }
        
        query += ' ORDER BY d.log_date DESC, d.created_at DESC';
        
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
            .query('SELECT * FROM EPC_Documents WHERE id = @id');
        
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
            log_date, filled_by, branch_id, branch_name, product_text, comments,
            // Raw Material
            raw_appearance_good, raw_appearance_action,
            raw_temperature_ok, raw_temperature_action,
            raw_production_date, raw_expiry_date,
            // Visual Inspection
            visual_work_area_clean, visual_work_area_action,
            visual_food_handling, visual_food_handling_action,
            visual_ingredients_appearance, visual_ingredients_action,
            // Food Lose
            food_correct_weight, food_correct_weight_action,
            food_cutleries_present, food_cutleries_action,
            // Packaging
            pkg_correct_packaging, pkg_correct_packaging_action,
            pkg_clean, pkg_clean_action,
            pkg_correct_label, pkg_correct_label_action,
            pkg_correct_shelf_life, pkg_correct_shelf_life_action,
            pkg_sealed_properly, pkg_sealed_properly_action,
            // End Product
            end_overall_presentation, end_overall_presentation_action,
            end_tasting, end_tasting_action,
            // Retention
            retention_taken
        } = req.body;
        
        const pool = await getPool();
        
        // Generate unique document number
        let docNumber = generateDocumentNumber(log_date);
        
        const existingResult = await pool.request()
            .input('prefix', sql.NVarChar, docNumber.substring(0, docNumber.length - 3) + '%')
            .query('SELECT document_number FROM EPC_Documents WHERE document_number LIKE @prefix ORDER BY document_number DESC');
        
        if (existingResult.recordset.length > 0) {
            const lastNum = existingResult.recordset[0].document_number;
            const lastSeq = parseInt(lastNum.slice(-3));
            docNumber = docNumber.substring(0, docNumber.length - 3) + String(lastSeq + 1).padStart(3, '0');
        }
        
        const result = await pool.request()
            .input('document_number', sql.NVarChar, docNumber)
            .input('log_date', sql.Date, log_date)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('branch_id', sql.Int, branch_id)
            .input('branch_name', sql.NVarChar, branch_name)
            .input('product_text', sql.NVarChar, product_text)
            .input('comments', sql.NVarChar, comments || null)
            // Raw Material
            .input('raw_appearance_good', sql.Bit, raw_appearance_good)
            .input('raw_appearance_action', sql.NVarChar, raw_appearance_action || null)
            .input('raw_temperature_ok', sql.Bit, raw_temperature_ok)
            .input('raw_temperature_action', sql.NVarChar, raw_temperature_action || null)
            .input('raw_production_date', sql.Date, raw_production_date || null)
            .input('raw_expiry_date', sql.Date, raw_expiry_date || null)
            // Visual Inspection
            .input('visual_work_area_clean', sql.Bit, visual_work_area_clean)
            .input('visual_work_area_action', sql.NVarChar, visual_work_area_action || null)
            .input('visual_food_handling', sql.Bit, visual_food_handling)
            .input('visual_food_handling_action', sql.NVarChar, visual_food_handling_action || null)
            .input('visual_ingredients_appearance', sql.Bit, visual_ingredients_appearance)
            .input('visual_ingredients_action', sql.NVarChar, visual_ingredients_action || null)
            // Food Lose
            .input('food_correct_weight', sql.Bit, food_correct_weight)
            .input('food_correct_weight_action', sql.NVarChar, food_correct_weight_action || null)
            .input('food_cutleries_present', sql.Bit, food_cutleries_present)
            .input('food_cutleries_action', sql.NVarChar, food_cutleries_action || null)
            // Packaging
            .input('pkg_correct_packaging', sql.Bit, pkg_correct_packaging)
            .input('pkg_correct_packaging_action', sql.NVarChar, pkg_correct_packaging_action || null)
            .input('pkg_clean', sql.Bit, pkg_clean)
            .input('pkg_clean_action', sql.NVarChar, pkg_clean_action || null)
            .input('pkg_correct_label', sql.Bit, pkg_correct_label)
            .input('pkg_correct_label_action', sql.NVarChar, pkg_correct_label_action || null)
            .input('pkg_correct_shelf_life', sql.Bit, pkg_correct_shelf_life)
            .input('pkg_correct_shelf_life_action', sql.NVarChar, pkg_correct_shelf_life_action || null)
            .input('pkg_sealed_properly', sql.Bit, pkg_sealed_properly)
            .input('pkg_sealed_properly_action', sql.NVarChar, pkg_sealed_properly_action || null)
            // End Product
            .input('end_overall_presentation', sql.Bit, end_overall_presentation)
            .input('end_overall_presentation_action', sql.NVarChar, end_overall_presentation_action || null)
            .input('end_tasting', sql.Bit, end_tasting)
            .input('end_tasting_action', sql.NVarChar, end_tasting_action || null)
            // Retention
            .input('retention_taken', sql.Bit, retention_taken || false)
            .query(`
                INSERT INTO EPC_Documents (
                    document_number, log_date, filled_by, branch_id, branch_name, product_text, comments,
                    raw_appearance_good, raw_appearance_action, raw_temperature_ok, raw_temperature_action,
                    raw_production_date, raw_expiry_date,
                    visual_work_area_clean, visual_work_area_action, visual_food_handling, visual_food_handling_action,
                    visual_ingredients_appearance, visual_ingredients_action,
                    food_correct_weight, food_correct_weight_action, food_cutleries_present, food_cutleries_action,
                    pkg_correct_packaging, pkg_correct_packaging_action, pkg_clean, pkg_clean_action,
                    pkg_correct_label, pkg_correct_label_action, pkg_correct_shelf_life, pkg_correct_shelf_life_action,
                    pkg_sealed_properly, pkg_sealed_properly_action,
                    end_overall_presentation, end_overall_presentation_action, end_tasting, end_tasting_action,
                    retention_taken
                )
                OUTPUT INSERTED.*
                VALUES (
                    @document_number, @log_date, @filled_by, @branch_id, @branch_name, @product_text, @comments,
                    @raw_appearance_good, @raw_appearance_action, @raw_temperature_ok, @raw_temperature_action,
                    @raw_production_date, @raw_expiry_date,
                    @visual_work_area_clean, @visual_work_area_action, @visual_food_handling, @visual_food_handling_action,
                    @visual_ingredients_appearance, @visual_ingredients_action,
                    @food_correct_weight, @food_correct_weight_action, @food_cutleries_present, @food_cutleries_action,
                    @pkg_correct_packaging, @pkg_correct_packaging_action, @pkg_clean, @pkg_clean_action,
                    @pkg_correct_label, @pkg_correct_label_action, @pkg_correct_shelf_life, @pkg_correct_shelf_life_action,
                    @pkg_sealed_properly, @pkg_sealed_properly_action,
                    @end_overall_presentation, @end_overall_presentation_action, @end_tasting, @end_tasting_action,
                    @retention_taken
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
            // Raw Material
            raw_appearance_good, raw_appearance_action,
            raw_temperature_ok, raw_temperature_action,
            raw_production_date, raw_expiry_date,
            // Visual Inspection
            visual_work_area_clean, visual_work_area_action,
            visual_food_handling, visual_food_handling_action,
            visual_ingredients_appearance, visual_ingredients_action,
            // Food Lose
            food_correct_weight, food_correct_weight_action,
            food_cutleries_present, food_cutleries_action,
            // Packaging
            pkg_correct_packaging, pkg_correct_packaging_action,
            pkg_clean, pkg_clean_action,
            pkg_correct_label, pkg_correct_label_action,
            pkg_correct_shelf_life, pkg_correct_shelf_life_action,
            pkg_sealed_properly, pkg_sealed_properly_action,
            // End Product
            end_overall_presentation, end_overall_presentation_action,
            end_tasting, end_tasting_action,
            // Retention
            retention_taken
        } = req.body;
        
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('comments', sql.NVarChar, comments || null)
            .input('status', sql.NVarChar, status || 'Active')
            // Raw Material
            .input('raw_appearance_good', sql.Bit, raw_appearance_good)
            .input('raw_appearance_action', sql.NVarChar, raw_appearance_action || null)
            .input('raw_temperature_ok', sql.Bit, raw_temperature_ok)
            .input('raw_temperature_action', sql.NVarChar, raw_temperature_action || null)
            .input('raw_production_date', sql.Date, raw_production_date || null)
            .input('raw_expiry_date', sql.Date, raw_expiry_date || null)
            // Visual Inspection
            .input('visual_work_area_clean', sql.Bit, visual_work_area_clean)
            .input('visual_work_area_action', sql.NVarChar, visual_work_area_action || null)
            .input('visual_food_handling', sql.Bit, visual_food_handling)
            .input('visual_food_handling_action', sql.NVarChar, visual_food_handling_action || null)
            .input('visual_ingredients_appearance', sql.Bit, visual_ingredients_appearance)
            .input('visual_ingredients_action', sql.NVarChar, visual_ingredients_action || null)
            // Food Lose
            .input('food_correct_weight', sql.Bit, food_correct_weight)
            .input('food_correct_weight_action', sql.NVarChar, food_correct_weight_action || null)
            .input('food_cutleries_present', sql.Bit, food_cutleries_present)
            .input('food_cutleries_action', sql.NVarChar, food_cutleries_action || null)
            // Packaging
            .input('pkg_correct_packaging', sql.Bit, pkg_correct_packaging)
            .input('pkg_correct_packaging_action', sql.NVarChar, pkg_correct_packaging_action || null)
            .input('pkg_clean', sql.Bit, pkg_clean)
            .input('pkg_clean_action', sql.NVarChar, pkg_clean_action || null)
            .input('pkg_correct_label', sql.Bit, pkg_correct_label)
            .input('pkg_correct_label_action', sql.NVarChar, pkg_correct_label_action || null)
            .input('pkg_correct_shelf_life', sql.Bit, pkg_correct_shelf_life)
            .input('pkg_correct_shelf_life_action', sql.NVarChar, pkg_correct_shelf_life_action || null)
            .input('pkg_sealed_properly', sql.Bit, pkg_sealed_properly)
            .input('pkg_sealed_properly_action', sql.NVarChar, pkg_sealed_properly_action || null)
            // End Product
            .input('end_overall_presentation', sql.Bit, end_overall_presentation)
            .input('end_overall_presentation_action', sql.NVarChar, end_overall_presentation_action || null)
            .input('end_tasting', sql.Bit, end_tasting)
            .input('end_tasting_action', sql.NVarChar, end_tasting_action || null)
            // Retention
            .input('retention_taken', sql.Bit, retention_taken || false)
            .query(`
                UPDATE EPC_Documents SET
                    comments = @comments,
                    status = @status,
                    raw_appearance_good = @raw_appearance_good,
                    raw_appearance_action = @raw_appearance_action,
                    raw_temperature_ok = @raw_temperature_ok,
                    raw_temperature_action = @raw_temperature_action,
                    raw_production_date = @raw_production_date,
                    raw_expiry_date = @raw_expiry_date,
                    visual_work_area_clean = @visual_work_area_clean,
                    visual_work_area_action = @visual_work_area_action,
                    visual_food_handling = @visual_food_handling,
                    visual_food_handling_action = @visual_food_handling_action,
                    visual_ingredients_appearance = @visual_ingredients_appearance,
                    visual_ingredients_action = @visual_ingredients_action,
                    food_correct_weight = @food_correct_weight,
                    food_correct_weight_action = @food_correct_weight_action,
                    food_cutleries_present = @food_cutleries_present,
                    food_cutleries_action = @food_cutleries_action,
                    pkg_correct_packaging = @pkg_correct_packaging,
                    pkg_correct_packaging_action = @pkg_correct_packaging_action,
                    pkg_clean = @pkg_clean,
                    pkg_clean_action = @pkg_clean_action,
                    pkg_correct_label = @pkg_correct_label,
                    pkg_correct_label_action = @pkg_correct_label_action,
                    pkg_correct_shelf_life = @pkg_correct_shelf_life,
                    pkg_correct_shelf_life_action = @pkg_correct_shelf_life_action,
                    pkg_sealed_properly = @pkg_sealed_properly,
                    pkg_sealed_properly_action = @pkg_sealed_properly_action,
                    end_overall_presentation = @end_overall_presentation,
                    end_overall_presentation_action = @end_overall_presentation_action,
                    end_tasting = @end_tasting,
                    end_tasting_action = @end_tasting_action,
                    retention_taken = @retention_taken,
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
            .query('DELETE FROM EPC_Documents WHERE id = @id');
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
                UPDATE EPC_Documents SET
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
            .query('SELECT COUNT(*) as count FROM EPC_Documents WHERE log_date = @today');
        
        // Get pending verification count
        const pendingResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM EPC_Documents WHERE is_verified = 0');
        
        // Get this week's verified count
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const verifiedResult = await pool.request()
            .input('weekStart', sql.Date, weekStart.toISOString().split('T')[0])
            .query('SELECT COUNT(*) as count FROM EPC_Documents WHERE is_verified = 1 AND log_date >= @weekStart');
        
        // Get total branches
        const branchesResult = await pool.request()
            .query('SELECT COUNT(*) as count FROM EPC_Branches WHERE is_active = 1');
        
        res.json({
            todayCount: todayResult.recordset[0].count,
            pendingCount: pendingResult.recordset[0].count,
            verifiedCount: verifiedResult.recordset[0].count,
            totalBranches: branchesResult.recordset[0].count
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

module.exports = router;
