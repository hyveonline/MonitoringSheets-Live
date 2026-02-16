/**
 * Hygiene Settings Routes (Hygiene Checklist Module)
 * Manages system settings for the hygiene checklist
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const path = require('path');
const config = require(path.join(process.cwd(), 'config', 'default'));
const { requireAuth, requireRole } = require(path.join(process.cwd(), 'auth', 'auth-server'));

// ==========================================
// Get all settings
// ==========================================
router.get('/', requireAuth, async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        const result = await pool.request()
            .query(`
                SELECT setting_key, setting_value, updated_at
                FROM HygieneSettings
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

// ==========================================
// Get all settings with metadata (for admin)
// ==========================================
router.get('/all', requireAuth, requireRole('SuperAuditor', 'Admin'), async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        const result = await pool.request()
            .query(`
                SELECT id, setting_key, setting_value, updated_at
                FROM HygieneSettings
                ORDER BY id
            `);
        
        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Update settings (batch)
// ==========================================
router.put('/', requireAuth, requireRole('SuperAuditor', 'Admin'), async (req, res) => {
    try {
        const settings = req.body;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object is required' });
        }
        
        const pool = await sql.connect(config.database);
        const transaction = new sql.Transaction(pool);
        
        await transaction.begin();
        
        try {
            for (const [key, value] of Object.entries(settings)) {
                // Use MERGE to insert or update
                await transaction.request()
                    .input('key', sql.NVarChar, key)
                    .input('value', sql.NVarChar, value)
                    .query(`
                        MERGE HygieneSettings AS target
                        USING (SELECT @key AS setting_key) AS source
                        ON target.setting_key = source.setting_key
                        WHEN MATCHED THEN
                            UPDATE SET setting_value = @value, 
                                       updated_at = GETDATE()
                        WHEN NOT MATCHED THEN
                            INSERT (setting_key, setting_value)
                            VALUES (@key, @value);
                    `);
            }
            
            await transaction.commit();
            
            res.json({ success: true, message: 'Settings updated successfully' });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Update single setting
// ==========================================
router.put('/:key', requireAuth, requireRole('SuperAuditor', 'Admin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }
        
        const pool = await sql.connect(config.database);
        
        const result = await pool.request()
            .input('key', sql.NVarChar, key)
            .input('value', sql.NVarChar, value)
            .query(`
                UPDATE HygieneSettings 
                SET setting_value = @value, 
                    updated_at = GETDATE()
                WHERE setting_key = @key;
                
                SELECT @@ROWCOUNT as affected;
            `);
        
        if (result.recordset[0].affected === 0) {
            // Insert if doesn't exist
            await pool.request()
                .input('key', sql.NVarChar, key)
                .input('value', sql.NVarChar, value)
                .query(`
                    INSERT INTO HygieneSettings (setting_key, setting_value)
                    VALUES (@key, @value)
                `);
        }
        
        res.json({ success: true, message: 'Setting updated successfully' });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
