const express = require('express');
const router = express.Router();
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'expiry-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

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

// Serve uploaded images
router.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Image not found');
    }
});

// Prevent caching on all API routes
router.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ==========================================
// API Routes - Settings
// ==========================================

// Get settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query(`SELECT * FROM DryStoreExpirySettings`);
        
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
                    IF EXISTS (SELECT 1 FROM DryStoreExpirySettings WHERE setting_key = @key)
                        UPDATE DryStoreExpirySettings SET setting_value = @value, updated_at = GETDATE() WHERE setting_key = @key
                    ELSE
                        INSERT INTO DryStoreExpirySettings (setting_key, setting_value) VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// API: Get sections
router.get('/api/sections', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .query('SELECT * FROM DryStoreExpirySections WHERE is_active = 1 ORDER BY name');
        res.json(result.recordset);
    } catch (err) {
        console.error('Error fetching sections:', err);
        res.status(500).json({ error: 'Failed to fetch sections' });
    }
});

// API: Create section
router.post('/api/sections', async (req, res) => {
    try {
        const { name } = req.body;
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('name', sql.NVarChar, name)
            .query('INSERT INTO DryStoreExpirySections (name) OUTPUT INSERTED.* VALUES (@name)');
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating section:', err);
        res.status(500).json({ error: 'Failed to create section' });
    }
});

// API: Delete section
router.delete('/api/sections/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE DryStoreExpirySections SET is_active = 0 WHERE id = @id');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting section:', err);
        res.status(500).json({ error: 'Failed to delete section' });
    }
});

// API: Get all readings (with items included)
router.get('/api/readings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        
        // Build query with optional filters
        let query = 'SELECT * FROM DryStoreExpiryReadings WHERE 1=1';
        const request = pool.request();
        
        if (req.query.date) {
            query += ' AND log_date = @date';
            request.input('date', sql.Date, req.query.date);
        }
        if (req.query.section) {
            query += ' AND section = @section';
            request.input('section', sql.NVarChar, req.query.section);
        }
        if (req.query.status) {
            query += ' AND overall_status = @status';
            request.input('status', sql.NVarChar, req.query.status);
        }
        
        query += ' ORDER BY log_date DESC, created_at DESC';
        const result = await request.query(query);
        
        // Include items for each reading
        const readings = result.recordset;
        for (const reading of readings) {
            const itemsResult = await pool.request()
                .input('rid', sql.Int, reading.id)
                .query('SELECT * FROM DryStoreExpiryItems WHERE reading_id = @rid ORDER BY id');
            reading.items = itemsResult.recordset;
        }
        
        res.json(readings);
    } catch (err) {
        console.error('Error fetching readings:', err);
        res.status(500).json({ error: 'Failed to fetch readings' });
    }
});

// API: Get single reading with items
router.get('/api/readings/:id', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const readingResult = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM DryStoreExpiryReadings WHERE id = @id');
        
        if (readingResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Reading not found' });
        }
        
        const itemsResult = await pool.request()
            .input('reading_id', sql.Int, req.params.id)
            .query('SELECT * FROM DryStoreExpiryItems WHERE reading_id = @reading_id ORDER BY id');
        
        const reading = readingResult.recordset[0];
        reading.items = itemsResult.recordset;
        
        res.json(reading);
    } catch (err) {
        console.error('Error fetching reading:', err);
        res.status(500).json({ error: 'Failed to fetch reading' });
    }
});

// Generate document number
async function generateDocNumber(pool) {
    const today = new Date();
    const prefix = `DSE-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    
    const result = await pool.request()
        .input('prefix', sql.NVarChar, prefix + '%')
        .query("SELECT TOP 1 document_number FROM DryStoreExpiryReadings WHERE document_number LIKE @prefix ORDER BY document_number DESC");
    
    let sequence = 1;
    if (result.recordset.length > 0) {
        const lastNum = result.recordset[0].document_number;
        const lastSeq = parseInt(lastNum.split('-').pop());
        sequence = lastSeq + 1;
    }
    
    return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

// Calculate item status based on expiry date and log date
function calculateStatus(expiryDate, logDate) {
    const expiry = new Date(expiryDate);
    const log = new Date(logDate);
    const oneMonthLater = new Date(log);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    
    if (expiry < log) {
        return 'Expired'; // RED - expired
    } else if (expiry <= oneMonthLater) {
        return 'Expiring'; // ORANGE - within 1 month
    }
    return 'OK'; // GREEN - more than 1 month
}

// Calculate overall status
function calculateOverallStatus(items, logDate) {
    let hasExpired = false;
    let hasExpiring = false;
    
    for (const item of items) {
        const status = calculateStatus(item.expiry_date, logDate);
        if (status === 'Expired') hasExpired = true;
        if (status === 'Expiring') hasExpiring = true;
    }
    
    if (hasExpired) return 'Expired';
    if (hasExpiring) return 'Expiring';
    return 'OK';
}

// API: Create reading
router.post('/api/readings', upload.single('image'), async (req, res) => {
    try {
        const { log_date, branch, section, comments, filled_by, items } = req.body;
        const parsedItems = JSON.parse(items || '[]');
        
        const pool = await sql.connect(dbConfig);
        const docNumber = await generateDocNumber(pool);
        
        const imagePath = req.file ? req.file.filename : null;
        const overallStatus = calculateOverallStatus(parsedItems, log_date);
        
        const result = await pool.request()
            .input('document_number', sql.NVarChar, docNumber)
            .input('log_date', sql.Date, log_date)
            .input('branch', sql.NVarChar, branch)
            .input('section', sql.NVarChar, section)
            .input('comments', sql.NVarChar, comments || null)
            .input('image_path', sql.NVarChar, imagePath)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('overall_status', sql.NVarChar, overallStatus)
            .query(`
                INSERT INTO DryStoreExpiryReadings (
                    document_number, log_date, branch, section, comments, image_path, filled_by, overall_status
                )
                OUTPUT INSERTED.*
                VALUES (
                    @document_number, @log_date, @branch, @section, @comments, @image_path, @filled_by, @overall_status
                )
            `);
        
        const readingId = result.recordset[0].id;
        
        // Insert items
        for (const item of parsedItems) {
            const itemStatus = calculateStatus(item.expiry_date, log_date);
            await pool.request()
                .input('reading_id', sql.Int, readingId)
                .input('product_name', sql.NVarChar, item.product_name)
                .input('expiry_date', sql.Date, item.expiry_date)
                .input('status', sql.NVarChar, itemStatus)
                .query(`
                    INSERT INTO DryStoreExpiryItems (reading_id, product_name, expiry_date, status)
                    VALUES (@reading_id, @product_name, @expiry_date, @status)
                `);
        }
        
        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Error creating reading:', err);
        res.status(500).json({ error: 'Failed to create reading' });
    }
});

// API: Update reading
router.put('/api/readings/:id', upload.single('image'), async (req, res) => {
    try {
        const { log_date, branch, section, comments, filled_by, items, keep_image } = req.body;
        const parsedItems = JSON.parse(items || '[]');
        
        const pool = await sql.connect(dbConfig);
        
        // Get current image path
        const currentReading = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT image_path FROM DryStoreExpiryReadings WHERE id = @id');
        
        let imagePath = currentReading.recordset[0]?.image_path;
        
        if (req.file) {
            // Delete old image if exists
            if (imagePath) {
                const oldPath = path.join(__dirname, 'uploads', imagePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            imagePath = req.file.filename;
        } else if (keep_image !== 'true') {
            // Remove image if not keeping
            if (imagePath) {
                const oldPath = path.join(__dirname, 'uploads', imagePath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            imagePath = null;
        }
        
        const overallStatus = calculateOverallStatus(parsedItems, log_date);
        
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('log_date', sql.Date, log_date)
            .input('branch', sql.NVarChar, branch)
            .input('section', sql.NVarChar, section)
            .input('comments', sql.NVarChar, comments || null)
            .input('image_path', sql.NVarChar, imagePath)
            .input('filled_by', sql.NVarChar, filled_by)
            .input('overall_status', sql.NVarChar, overallStatus)
            .query(`
                UPDATE DryStoreExpiryReadings SET
                    log_date = @log_date, branch = @branch, section = @section,
                    comments = @comments, image_path = @image_path,
                    filled_by = @filled_by, overall_status = @overall_status,
                    updated_at = GETDATE()
                OUTPUT INSERTED.*
                WHERE id = @id
            `);
        
        // Delete old items and insert new ones
        await pool.request()
            .input('reading_id', sql.Int, req.params.id)
            .query('DELETE FROM DryStoreExpiryItems WHERE reading_id = @reading_id');
        
        for (const item of parsedItems) {
            const itemStatus = calculateStatus(item.expiry_date, log_date);
            await pool.request()
                .input('reading_id', sql.Int, req.params.id)
                .input('product_name', sql.NVarChar, item.product_name)
                .input('expiry_date', sql.Date, item.expiry_date)
                .input('status', sql.NVarChar, itemStatus)
                .query(`
                    INSERT INTO DryStoreExpiryItems (reading_id, product_name, expiry_date, status)
                    VALUES (@reading_id, @product_name, @expiry_date, @status)
                `);
        }
        
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
        
        // Get image path to delete
        const reading = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT image_path FROM DryStoreExpiryReadings WHERE id = @id');
        
        if (reading.recordset[0]?.image_path) {
            const imagePath = path.join(__dirname, 'uploads', reading.recordset[0].image_path);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('DELETE FROM DryStoreExpiryReadings WHERE id = @id');
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
                UPDATE DryStoreExpiryReadings 
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

// ==========================================
// Settings APIs
// ==========================================

// Get settings
router.get('/api/settings', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT setting_key, setting_value FROM DryStoreExpirySettings
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
        const pool = await sql.connect(dbConfig);
        
        for (const [key, value] of Object.entries(req.body)) {
            const existsResult = await pool.request()
                .input('key', sql.NVarChar, key)
                .query('SELECT id FROM DryStoreExpirySettings WHERE setting_key = @key');
            
            if (existsResult.recordset.length > 0) {
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`UPDATE DryStoreExpirySettings SET setting_value = @value WHERE setting_key = @key`);
            } else {
                await pool.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`INSERT INTO DryStoreExpirySettings (setting_key, setting_value) VALUES (@key, @value)`);
            }
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error saving settings:', err);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

module.exports = router;
