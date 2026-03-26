/**
 * Recipe Verification Checklist Module
 * Track recipe verification quality control
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const sql = require('mssql');
const requireRole = require('../../auth/middleware/require-role');

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
            .query('SELECT setting_key, setting_value FROM RV_Settings');
        
        // Convert array to object for dashboard compatibility
        const settings = {};
        result.recordset.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        
        // Map to dashboard-expected keys
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
                    IF EXISTS (SELECT 1 FROM RV_Settings WHERE setting_key = @key)
                        UPDATE RV_Settings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO RV_Settings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==========================================
// Recipe Items APIs
// ==========================================

// Get all recipe items
router.get('/api/recipe-items', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT * FROM RV_RecipeItems WHERE is_active = 1 ORDER BY item_name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching recipe items:', err);
        res.status(500).json({ error: 'Failed to fetch recipe items' });
    }
});

// Get single recipe item
router.get('/api/recipe-items/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM RV_RecipeItems WHERE id = @id');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Recipe item not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching recipe item:', err);
        res.status(500).json({ error: 'Failed to fetch recipe item' });
    }
});

// Add recipe item
router.post('/api/recipe-items', async (req, res) => {
    try {
        const { item_name, ingredients, tasting_criteria, tasting_enabled } = req.body;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('item_name', sql.NVarChar, item_name)
            .input('ingredients', sql.NVarChar, ingredients)
            .input('tasting_criteria', sql.NVarChar, tasting_criteria || null)
            .input('tasting_enabled', sql.Bit, tasting_enabled !== false ? 1 : 0)
            .query(`
                INSERT INTO RV_RecipeItems (item_name, ingredients, tasting_criteria, tasting_enabled)
                OUTPUT INSERTED.*
                VALUES (@item_name, @ingredients, @tasting_criteria, @tasting_enabled)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding recipe item:', err);
        res.status(500).json({ error: 'Failed to add recipe item' });
    }
});

// Update recipe item
router.put('/api/recipe-items/:id', async (req, res) => {
    try {
        const { item_name, ingredients, tasting_criteria, tasting_enabled } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('item_name', sql.NVarChar, item_name)
            .input('ingredients', sql.NVarChar, ingredients)
            .input('tasting_criteria', sql.NVarChar, tasting_criteria || null)
            .input('tasting_enabled', sql.Bit, tasting_enabled !== false ? 1 : 0)
            .query(`
                UPDATE RV_RecipeItems SET
                    item_name = @item_name,
                    ingredients = @ingredients,
                    tasting_criteria = @tasting_criteria,
                    tasting_enabled = @tasting_enabled,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating recipe item:', err);
        res.status(500).json({ error: 'Failed to update recipe item' });
    }
});

// Delete recipe item (soft delete)
router.delete('/api/recipe-items/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE RV_RecipeItems SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting recipe item:', err);
        res.status(500).json({ error: 'Failed to delete recipe item' });
    }
});

// ==========================================
// Ingredients APIs (with weight ranges)
// ==========================================

// Get all ingredients for a recipe item
router.get('/api/recipe-items/:id/ingredients', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('recipe_item_id', sql.Int, req.params.id)
            .query(`
                SELECT * FROM RV_Ingredients 
                WHERE recipe_item_id = @recipe_item_id AND is_active = 1
                ORDER BY sort_order, ingredient_name
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching ingredients:', err);
        res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
});

// Get all ingredients (for form loading)
router.get('/api/ingredients', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`
                SELECT ing.*, ri.item_name, ri.tasting_criteria
                FROM RV_Ingredients ing
                JOIN RV_RecipeItems ri ON ing.recipe_item_id = ri.id
                WHERE ing.is_active = 1 AND ri.is_active = 1
                ORDER BY ri.item_name, ing.sort_order, ing.ingredient_name
            `);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching all ingredients:', err);
        res.status(500).json({ error: 'Failed to fetch ingredients' });
    }
});

// Add ingredient to recipe item
router.post('/api/recipe-items/:id/ingredients', async (req, res) => {
    try {
        const { ingredient_name, weight_min, weight_max, unit, tasting_enabled } = req.body;
        const pool = await getPool();
        
        // Get max sort order
        const sortResult = await pool.request()
            .input('recipe_item_id', sql.Int, req.params.id)
            .query('SELECT ISNULL(MAX(sort_order), 0) + 1 as next_order FROM RV_Ingredients WHERE recipe_item_id = @recipe_item_id');
        
        const result = await pool.request()
            .input('recipe_item_id', sql.Int, req.params.id)
            .input('ingredient_name', sql.NVarChar, ingredient_name)
            .input('weight_min', sql.Decimal(10, 2), weight_min || null)
            .input('weight_max', sql.Decimal(10, 2), weight_max || null)
            .input('unit', sql.NVarChar, unit || 'g')
            .input('tasting_enabled', sql.Bit, tasting_enabled !== false ? 1 : 0)
            .input('sort_order', sql.Int, sortResult.recordset[0].next_order)
            .query(`
                INSERT INTO RV_Ingredients (recipe_item_id, ingredient_name, weight_min, weight_max, unit, tasting_enabled, sort_order)
                OUTPUT INSERTED.*
                VALUES (@recipe_item_id, @ingredient_name, @weight_min, @weight_max, @unit, @tasting_enabled, @sort_order)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error adding ingredient:', err);
        res.status(500).json({ error: 'Failed to add ingredient' });
    }
});

// Update ingredient
router.put('/api/ingredients/:id', async (req, res) => {
    try {
        const { ingredient_name, weight_min, weight_max, unit, tasting_enabled } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('ingredient_name', sql.NVarChar, ingredient_name)
            .input('weight_min', sql.Decimal(10, 2), weight_min || null)
            .input('weight_max', sql.Decimal(10, 2), weight_max || null)
            .input('unit', sql.NVarChar, unit || 'g')
            .input('tasting_enabled', sql.Bit, tasting_enabled !== false ? 1 : 0)
            .query(`
                UPDATE RV_Ingredients SET
                    ingredient_name = @ingredient_name,
                    weight_min = @weight_min,
                    weight_max = @weight_max,
                    unit = @unit,
                    tasting_enabled = @tasting_enabled,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating ingredient:', err);
        res.status(500).json({ error: 'Failed to update ingredient' });
    }
});

// Delete ingredient
router.delete('/api/ingredients/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE RV_Ingredients SET is_active = 0, updated_at = GETDATE() WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting ingredient:', err);
        res.status(500).json({ error: 'Failed to delete ingredient' });
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
    return `RV-${year}${month}${day}-001`;
}

// Get documents (with filters)
router.get('/api/documents', async (req, res) => {
    try {
        const { date, from, to, status } = req.query;
        const pool = await getPool();
        
        let query = `
            SELECT d.*, 
                   (SELECT COUNT(*) FROM RV_Entries WHERE document_id = d.id) as entry_count
            FROM RV_Documents d
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
        
        query += ' ORDER BY d.log_date DESC, d.created_at DESC';
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching documents:', err);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// Get single document with entries
router.get('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        
        // Get document
        const docResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM RV_Documents WHERE id = @id');
        
        if (docResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        
        const document = docResult.recordset[0];
        
        // Get entries (ordered by recipe item for proper grouping)
        const entriesResult = await pool.request()
            .input('document_id', sql.Int, req.params.id)
            .query('SELECT * FROM RV_Entries WHERE document_id = @document_id ORDER BY recipe_item_id, id');
        
        document.entries = entriesResult.recordset;
        
        res.json(document);
    } catch (err) {
        console.error('Error fetching document:', err);
        res.status(500).json({ error: 'Failed to fetch document' });
    }
});

// Create document
router.post('/api/documents', async (req, res) => {
    try {
        const { log_date, filled_by } = req.body;
        const pool = await getPool();
        
        // Generate unique document number
        let docNumber = generateDocumentNumber(log_date);
        
        // Check if number exists, increment if needed
        const existingResult = await pool.request()
            .input('prefix', sql.NVarChar, docNumber.substring(0, docNumber.length - 3) + '%')
            .query('SELECT document_number FROM RV_Documents WHERE document_number LIKE @prefix ORDER BY document_number DESC');
        
        if (existingResult.recordset.length > 0) {
            const lastNum = existingResult.recordset[0].document_number;
            const lastSeq = parseInt(lastNum.slice(-3));
            docNumber = docNumber.substring(0, docNumber.length - 3) + String(lastSeq + 1).padStart(3, '0');
        }
        
        const result = await pool.request()
            .input('document_number', sql.NVarChar, docNumber)
            .input('log_date', sql.Date, log_date)
            .input('filled_by', sql.NVarChar, filled_by)
            .query(`
                INSERT INTO RV_Documents (document_number, log_date, filled_by)
                OUTPUT INSERTED.*
                VALUES (@document_number, @log_date, @filled_by)
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
        const { comments, status } = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('comments', sql.NVarChar, comments || null)
            .input('status', sql.NVarChar, status || 'Active')
            .query(`
                UPDATE RV_Documents SET
                    comments = @comments,
                    status = @status,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating document:', err);
        res.status(500).json({ error: 'Failed to update document' });
    }
});

// Verify document (Admin and SuperAuditor only)
router.post('/api/documents/:id/verify', requireRole('Admin', 'SuperAuditor', 'admin', 'superauditor'), async (req, res) => {
    try {
        const pool = await getPool();
        const verifiedBy = req.currentUser?.displayName || req.currentUser?.name || 'Unknown';
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by', sql.NVarChar, verifiedBy)
            .query(`
                UPDATE RV_Documents SET
                    is_verified = 1,
                    verified_by = @verified_by,
                    verified_at = GETDATE(),
                    status = 'Completed',
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error verifying document:', err);
        res.status(500).json({ error: 'Failed to verify document' });
    }
});

// Unverify document (Admin and SuperAuditor only)
router.post('/api/documents/:id/unverify', requireRole('Admin', 'SuperAuditor', 'admin', 'superauditor'), async (req, res) => {
    try {
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                UPDATE RV_Documents SET
                    is_verified = 0,
                    verified_by = NULL,
                    verified_at = NULL,
                    status = 'Completed',
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error unverifying document:', err);
        res.status(500).json({ error: 'Failed to unverify document' });
    }
});

// Delete document
router.delete('/api/documents/:id', async (req, res) => {
    try {
        const pool = await getPool();
        
        // Delete entries first (cascade should handle this, but just to be safe)
        await pool.request()
            .input('document_id', sql.Int, req.params.id)
            .query('DELETE FROM RV_Entries WHERE document_id = @document_id');
        
        // Delete document
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM RV_Documents WHERE id = @id');
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting document:', err);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

// ==========================================
// Entry APIs
// ==========================================

// Get entries for a document
router.get('/api/entries', async (req, res) => {
    try {
        const { document_id } = req.query;
        const pool = await getPool();
        
        const result = await pool.request()
            .input('document_id', sql.Int, document_id)
            .query('SELECT * FROM RV_Entries WHERE document_id = @document_id ORDER BY id');
        
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching entries:', err);
        res.status(500).json({ error: 'Failed to fetch entries' });
    }
});

// Create entry
router.post('/api/entries', async (req, res) => {
    try {
        const { 
            document_id, recipe_item_id, ingredient_id, item_name, ingredients, 
            tasting_criteria, tasting_enabled, weight_min, weight_max, weight_unit
        } = req.body;
        
        const pool = await getPool();
        
        const result = await pool.request()
            .input('document_id', sql.Int, document_id)
            .input('recipe_item_id', sql.Int, recipe_item_id)
            .input('ingredient_id', sql.Int, ingredient_id || null)
            .input('item_name', sql.NVarChar, item_name)
            .input('ingredients', sql.NVarChar, ingredients)
            .input('tasting_criteria', sql.NVarChar, tasting_criteria || null)
            .input('tasting_enabled', sql.Bit, tasting_enabled !== false ? 1 : 0)
            .input('weight_min', sql.Decimal(10, 2), weight_min || null)
            .input('weight_max', sql.Decimal(10, 2), weight_max || null)
            .input('weight_unit', sql.NVarChar, weight_unit || 'g')
            .query(`
                INSERT INTO RV_Entries (document_id, recipe_item_id, ingredient_id, item_name, ingredients, 
                    tasting_criteria, tasting_enabled, weight_min, weight_max, weight_unit)
                OUTPUT INSERTED.*
                VALUES (@document_id, @recipe_item_id, @ingredient_id, @item_name, @ingredients, 
                    @tasting_criteria, @tasting_enabled, @weight_min, @weight_max, @weight_unit)
            `);
        
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating entry:', err);
        res.status(500).json({ error: 'Failed to create entry' });
    }
});

// Update entry
router.put('/api/entries/:id', async (req, res) => {
    try {
        const entry = req.body;
        const pool = await getPool();
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('overall_quality', sql.Bit, entry.overall_quality)
            .input('overall_quality_action', sql.NVarChar, entry.overall_quality_action || null)
            .input('onsite_verification_weight', sql.Decimal(10, 2), entry.onsite_verification_weight || null)
            .input('tasting_result', sql.Bit, entry.tasting_result)
            .input('packaging_clean', sql.Bit, entry.packaging_clean)
            .input('packaging_clean_action', sql.NVarChar, entry.packaging_clean_action || null)
            .input('correct_packaging', sql.Bit, entry.correct_packaging)
            .input('correct_packaging_action', sql.NVarChar, entry.correct_packaging_action || null)
            .input('correct_shelf_life', sql.Bit, entry.correct_shelf_life)
            .input('correct_shelf_life_action', sql.NVarChar, entry.correct_shelf_life_action || null)
            .input('retention_sample', sql.Bit, entry.retention_sample)
            .input('retention_sample_action', sql.NVarChar, entry.retention_sample_action || null)
            .input('overall_status', sql.NVarChar, entry.overall_status || 'Pending')
            .query(`
                UPDATE RV_Entries SET
                    overall_quality = @overall_quality,
                    overall_quality_action = @overall_quality_action,
                    onsite_verification_weight = @onsite_verification_weight,
                    tasting_result = @tasting_result,
                    packaging_clean = @packaging_clean,
                    packaging_clean_action = @packaging_clean_action,
                    correct_packaging = @correct_packaging,
                    correct_packaging_action = @correct_packaging_action,
                    correct_shelf_life = @correct_shelf_life,
                    correct_shelf_life_action = @correct_shelf_life_action,
                    retention_sample = @retention_sample,
                    retention_sample_action = @retention_sample_action,
                    overall_status = @overall_status,
                    updated_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating entry:', err);
        res.status(500).json({ error: 'Failed to update entry' });
    }
});

// Delete entry
router.delete('/api/entries/:id', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM RV_Entries WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting entry:', err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

module.exports = router;
