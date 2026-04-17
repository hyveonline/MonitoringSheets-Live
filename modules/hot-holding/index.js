const express = require('express');
const router = express.Router();
const sql = require('mssql');
const path = require('path');

const dbConfig = {
    server: 'localhost',
    database: 'FSMonitoringDB',
    user: 'sa',
    password: 'Kokowawa123@@',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Serve static pages
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

// API: Get settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT * FROM HotHoldingSettings');
        
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

// API: Update settings
router.put('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        for (const [key, value] of Object.entries(req.body)) {
            await pool.request()
                .input('key', sql.NVarChar, key)
                .input('value', sql.NVarChar, value.toString())
                .query(`
                    IF EXISTS (SELECT 1 FROM HotHoldingSettings WHERE setting_key = @key)
                        UPDATE HotHoldingSettings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO HotHoldingSettings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// API: Get products
router.get('/api/products', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query('SELECT * FROM HotHoldingProducts WHERE is_active = 1 ORDER BY name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// API: Create product
router.post('/api/products', async (req, res) => {
    try {
        const { name } = req.body;
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('name', sql.NVarChar, name)
            .query('INSERT INTO HotHoldingProducts (name) OUTPUT INSERTED.* VALUES (@name)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating product:', err);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// API: Delete product
router.delete('/api/products/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE HotHoldingProducts SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// API: Get all readings
router.get('/api/readings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query('SELECT * FROM HotHoldingReadings ORDER BY log_date DESC, created_at DESC');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching readings:', err);
        res.status(500).json({ error: 'Failed to fetch readings' });
    }
});

// API: Get single reading
router.get('/api/readings/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM HotHoldingReadings WHERE id = @id');
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reading not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error fetching reading:', err);
        res.status(500).json({ error: 'Failed to fetch reading' });
    }
});

// Generate document number
async function generateDocNumber(pool) {
    const today = new Date();
    const prefix = `HH-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    
    const result = await pool.request()
        .input('prefix', sql.NVarChar, prefix + '%')
        .query("SELECT TOP 1 document_number FROM HotHoldingReadings WHERE document_number LIKE @prefix ORDER BY document_number DESC");
    
    let sequence = 1;
    if (result.recordset.length > 0) {
        const lastNum = result.recordset[0].document_number;
        const lastSeq = parseInt(lastNum.split('-').pop());
        sequence = lastSeq + 1;
    }
    
    return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

// API: Create reading
router.post('/api/readings', async (req, res) => {
    try {
        const {
            log_date, product,
            time1, product_temp1, unit_temp1,
            time2, product_temp2, unit_temp2,
            time3, product_temp3, unit_temp3,
            correct_clear_shelf_life, filled_by
        } = req.body;
        
        const pool = await sql.connect(dbConfig);
        const docNumber = await generateDocNumber(pool);
        
        const result = await pool.request()
            .input('document_number', sql.NVarChar, docNumber)
            .input('log_date', sql.Date, log_date)
            .input('product', sql.NVarChar, product)
            .input('time1', sql.NVarChar, time1 || null)
            .input('product_temp1', sql.Decimal(5, 2), product_temp1 || null)
            .input('unit_temp1', sql.Decimal(5, 2), unit_temp1 || null)
            .input('time2', sql.NVarChar, time2 || null)
            .input('product_temp2', sql.Decimal(5, 2), product_temp2 || null)
            .input('unit_temp2', sql.Decimal(5, 2), unit_temp2 || null)
            .input('time3', sql.NVarChar, time3 || null)
            .input('product_temp3', sql.Decimal(5, 2), product_temp3 || null)
            .input('unit_temp3', sql.Decimal(5, 2), unit_temp3 || null)
            .input('correct_clear_shelf_life', sql.NVarChar, correct_clear_shelf_life || null)
            .input('filled_by', sql.NVarChar, filled_by)
            .query(`
                INSERT INTO HotHoldingReadings (
                    document_number, log_date, product,
                    time1, product_temp1, unit_temp1,
                    time2, product_temp2, unit_temp2,
                    time3, product_temp3, unit_temp3,
                    correct_clear_shelf_life, filled_by
                )
                OUTPUT INSERTED.*
                VALUES (
                    @document_number, @log_date, @product,
                    @time1, @product_temp1, @unit_temp1,
                    @time2, @product_temp2, @unit_temp2,
                    @time3, @product_temp3, @unit_temp3,
                    @correct_clear_shelf_life, @filled_by
                )
            `);
        
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating reading:', err);
        res.status(500).json({ error: 'Failed to create reading' });
    }
});

// API: Update reading
router.put('/api/readings/:id', async (req, res) => {
    try {
        const {
            log_date, product,
            time1, product_temp1, unit_temp1,
            time2, product_temp2, unit_temp2,
            time3, product_temp3, unit_temp3,
            correct_clear_shelf_life, filled_by
        } = req.body;
        
        const pool = await sql.connect(dbConfig);
        
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('log_date', sql.Date, log_date)
            .input('product', sql.NVarChar, product)
            .input('time1', sql.NVarChar, time1 || null)
            .input('product_temp1', sql.Decimal(5, 2), product_temp1 || null)
            .input('unit_temp1', sql.Decimal(5, 2), unit_temp1 || null)
            .input('time2', sql.NVarChar, time2 || null)
            .input('product_temp2', sql.Decimal(5, 2), product_temp2 || null)
            .input('unit_temp2', sql.Decimal(5, 2), unit_temp2 || null)
            .input('time3', sql.NVarChar, time3 || null)
            .input('product_temp3', sql.Decimal(5, 2), product_temp3 || null)
            .input('unit_temp3', sql.Decimal(5, 2), unit_temp3 || null)
            .input('correct_clear_shelf_life', sql.NVarChar, correct_clear_shelf_life || null)
            .input('filled_by', sql.NVarChar, filled_by)
            .query(`
                UPDATE HotHoldingReadings SET
                    log_date = @log_date, product = @product,
                    time1 = @time1, product_temp1 = @product_temp1, unit_temp1 = @unit_temp1,
                    time2 = @time2, product_temp2 = @product_temp2, unit_temp2 = @unit_temp2,
                    time3 = @time3, product_temp3 = @product_temp3, unit_temp3 = @unit_temp3,
                    correct_clear_shelf_life = @correct_clear_shelf_life,
                    filled_by = @filled_by, updated_at = GETDATE()
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reading not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error updating reading:', err);
        res.status(500).json({ error: 'Failed to update reading' });
    }
});

// API: Delete reading
router.delete('/api/readings/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM HotHoldingReadings WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting reading:', err);
        res.status(500).json({ error: 'Failed to delete reading' });
    }
});

// API: Verify reading
router.post('/api/readings/:id/verify', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const verifiedBy = req.currentUser?.displayName || req.currentUser?.name || 'Unknown';
        
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by', sql.NVarChar, verifiedBy)
            .query(`
                UPDATE HotHoldingReadings 
                SET verified = 1, verified_by = @verified_by, verified_at = GETDATE()
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Reading not found' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('Error verifying reading:', err);
        res.status(500).json({ error: 'Failed to verify reading' });
    }
});

// API: Get current user
router.get('/api/current-user', (req, res) => {
    res.json({
        name: req.currentUser?.displayName || req.currentUser?.name || 'Unknown User',
        email: req.currentUser?.email || '',
        role: req.currentUser?.role || 'User'
    });
});

module.exports = router;
