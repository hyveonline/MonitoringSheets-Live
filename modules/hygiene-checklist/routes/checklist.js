/**
 * Hygiene Checklist Routes (Hygiene Checklist Module)
 * Manages hygiene checklist submission and history with document tracking
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const path = require('path');
const config = require(path.join(process.cwd(), 'config', 'default'));
const { requireAuth, requireRole } = require(path.join(process.cwd(), 'auth', 'auth-server'));

// ==========================================
// Get all sessions (documents) with filters
// ==========================================
router.get('/sessions', requireAuth, async (req, res) => {
    try {
        const { date_from, date_to, shift, limit = 50 } = req.query;
        
        const pool = await sql.connect(config.database);
        
        let query = `
            SELECT TOP (@limit)
                s.id, s.document_number, s.check_date, s.shift,
                ISNULL(s.total_employees, 0) as total_employees, 
                ISNULL(s.total_pass, 0) as total_pass, 
                ISNULL(s.total_fail, 0) as total_fail, 
                ISNULL(s.total_absent, 0) as total_absent,
                s.notes, s.created_at,
                ISNULL(s.verified, 0) as verified, s.verified_at,
                COALESCE(u.display_name, s.filled_by) as checked_by_name,
                v.display_name as verified_by_name
            FROM HygieneChecklistSessions s
            LEFT JOIN Users u ON s.checked_by = u.id
            LEFT JOIN Users v ON s.verified_by = v.id
            WHERE 1=1
        `;
        
        const request = pool.request();
        request.input('limit', sql.Int, parseInt(limit));
        
        if (date_from) {
            query += ' AND s.check_date >= @date_from';
            request.input('date_from', sql.Date, date_from);
        }
        
        if (date_to) {
            query += ' AND s.check_date <= @date_to';
            request.input('date_to', sql.Date, date_to);
        }
        
        if (shift) {
            query += ' AND s.shift = @shift';
            request.input('shift', sql.NVarChar, shift);
        }
        
        query += ' ORDER BY s.check_date DESC, s.created_at DESC';
        
        const result = await request.query(query);
        
        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Get single session with all employee checklists
// ==========================================
router.get('/sessions/:id', requireAuth, async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        // Get session header
        const session = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    s.id, s.document_number, s.check_date, s.shift,
                    ISNULL(s.total_employees, 0) as total_employees, 
                    ISNULL(s.total_pass, 0) as total_pass, 
                    ISNULL(s.total_fail, 0) as total_fail, 
                    ISNULL(s.total_absent, 0) as total_absent,
                    s.notes, s.created_at,
                    ISNULL(s.verified, 0) as verified, s.verified_at,
                    COALESCE(u.display_name, s.filled_by) as checked_by_name, s.checked_by as checked_by_id,
                    v.display_name as verified_by_name, s.verified_by as verified_by_id
                FROM HygieneChecklistSessions s
                LEFT JOIN Users u ON s.checked_by = u.id
                LEFT JOIN Users v ON s.verified_by = v.id
                WHERE s.id = @id
            `);
        
        if (session.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        // Get all employee checklists in this session
        const checklists = await pool.request()
            .input('session_id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    hc.id, hc.overall_pass, hc.is_absent, hc.notes,
                    e.id as employee_id, e.name as employee_name, 
                    e.gender as employee_gender, e.position as employee_position
                FROM HygieneChecklists hc
                JOIN Employees e ON hc.employee_id = e.id
                WHERE hc.session_id = @session_id
                ORDER BY e.name
            `);
        
        // Get all responses for each checklist
        const checklistIds = checklists.recordset.map(c => c.id);
        
        let responses = [];
        if (checklistIds.length > 0) {
            const responseResult = await pool.request()
                .query(`
                    SELECT 
                        r.checklist_id, r.response, r.notes as corrective_action,
                        i.id as item_id, i.name as item_name, i.sort_order
                    FROM HygieneChecklistResponses r
                    JOIN HygieneChecklistItems i ON r.item_id = i.id
                    WHERE r.checklist_id IN (${checklistIds.join(',')})
                    ORDER BY i.sort_order
                `);
            responses = responseResult.recordset;
        }
        
        // Group responses by checklist
        const employeeChecklists = checklists.recordset.map(c => ({
            ...c,
            responses: responses.filter(r => r.checklist_id === c.id)
        }));
        
        res.json({
            ...session.recordset[0],
            employees: employeeChecklists
        });
    } catch (error) {
        console.error('Error fetching session details:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Submit batch hygiene checklist (creates session/document)
// ==========================================
router.post('/batch', requireAuth, requireRole('SuperAuditor', 'Auditor', 'Admin'), async (req, res) => {
    try {
        const { check_date, shift, employees: employeeData, notes } = req.body;
        
        if (!shift || !employeeData || employeeData.length === 0) {
            return res.status(400).json({ 
                error: 'Shift and employee data are required' 
            });
        }
        
        const pool = await sql.connect(config.database);
        const transaction = new sql.Transaction(pool);
        
        await transaction.begin();
        
        try {
            // Get document prefix from settings
            const prefixResult = await transaction.request()
                .query(`SELECT setting_value FROM HygieneSettings WHERE setting_key = 'document_prefix'`);
            const docPrefix = prefixResult.recordset[0]?.setting_value || 'HYG';
            
            // Generate document number: PREFIX-YYYYMMDD-NNN
            const checkDate = check_date ? new Date(check_date) : new Date();
            const dateStr = checkDate.toISOString().split('T')[0].replace(/-/g, '');
            
            // Get the next sequence number for this date
            const seqResult = await transaction.request()
                .input('date', sql.Date, checkDate)
                .query(`
                    SELECT COUNT(*) + 1 as seq 
                    FROM HygieneChecklistSessions 
                    WHERE check_date = @date
                `);
            const seq = seqResult.recordset[0].seq.toString().padStart(3, '0');
            const documentNumber = `${docPrefix}-${dateStr}-${seq}`;
            
            // Calculate totals
            const totalEmployees = employeeData.length;
            const totalAbsent = employeeData.filter(e => e.absent).length;
            const totalPass = employeeData.filter(e => !e.absent && e.responses.every(r => r.checked)).length;
            const totalFail = totalEmployees - totalAbsent - totalPass;
            
            // Create session
            const sessionResult = await transaction.request()
                .input('document_number', sql.NVarChar, documentNumber)
                .input('check_date', sql.Date, checkDate)
                .input('shift', sql.NVarChar, shift)
                .input('checked_by', sql.Int, req.currentUser.id)
                .input('filled_by', sql.NVarChar, req.currentUser.displayName || req.currentUser.name || req.currentUser.email || 'Unknown')
                .input('total_employees', sql.Int, totalEmployees)
                .input('total_pass', sql.Int, totalPass)
                .input('total_fail', sql.Int, totalFail)
                .input('total_absent', sql.Int, totalAbsent)
                .input('notes', sql.NVarChar, notes || null)
                .query(`
                    INSERT INTO HygieneChecklistSessions 
                        (document_number, check_date, shift, checked_by, filled_by, total_employees, total_pass, total_fail, total_absent, notes)
                    OUTPUT INSERTED.id, INSERTED.document_number
                    VALUES 
                        (@document_number, @check_date, @shift, @checked_by, @filled_by, @total_employees, @total_pass, @total_fail, @total_absent, @notes)
                `);
            
            const session_id = sessionResult.recordset[0].id;
            const docNum = sessionResult.recordset[0].document_number;
            
            // Insert each employee checklist
            for (const emp of employeeData) {
                // Calculate overall pass for this employee
                const overall_pass = !emp.absent && emp.responses.every(r => r.checked);
                
                // Insert checklist header
                const checklistResult = await transaction.request()
                    .input('session_id', sql.Int, session_id)
                    .input('employee_id', sql.Int, emp.employee_id)
                    .input('store_id', sql.Int, req.currentUser.store_id || 1)
                    .input('check_date', sql.Date, checkDate)
                    .input('check_time', sql.Time, new Date())
                    .input('shift', sql.NVarChar, shift)
                    .input('checked_by', sql.Int, req.currentUser.id)
                    .input('overall_pass', sql.Bit, overall_pass)
                    .input('is_absent', sql.Bit, emp.absent || false)
                    .input('notes', sql.NVarChar, null)
                    .query(`
                        INSERT INTO HygieneChecklists 
                            (session_id, employee_id, store_id, check_date, check_time, shift, checked_by, overall_pass, is_absent, notes)
                        OUTPUT INSERTED.id
                        VALUES 
                            (@session_id, @employee_id, @store_id, @check_date, @check_time, @shift, @checked_by, @overall_pass, @is_absent, @notes)
                    `);
                
                const checklist_id = checklistResult.recordset[0].id;
                
                // Insert responses (only for non-absent employees)
                if (!emp.absent && emp.responses) {
                    for (const response of emp.responses) {
                        await transaction.request()
                            .input('checklist_id', sql.Int, checklist_id)
                            .input('item_id', sql.Int, response.item_id)
                            .input('response', sql.Bit, response.checked)
                            .input('notes', sql.NVarChar, response.corrective_action || null)
                            .query(`
                                INSERT INTO HygieneChecklistResponses (checklist_id, item_id, response, notes)
                                VALUES (@checklist_id, @item_id, @response, @notes)
                            `);
                    }
                }
            }
            
            await transaction.commit();
            
            res.status(201).json({ 
                success: true, 
                session_id,
                document_number: docNum,
                total_employees: totalEmployees,
                total_pass: totalPass,
                total_fail: totalFail,
                total_absent: totalAbsent,
                message: `Document ${docNum} created successfully`
            });
            
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
        
    } catch (error) {
        console.error('Error submitting batch checklist:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Legacy: Get all checklists (for backwards compatibility)
// ==========================================
router.get('/', requireAuth, async (req, res) => {
    try {
        const { employee_id, date_from, date_to, limit = 50 } = req.query;
        
        const pool = await sql.connect(config.database);
        
        let query = `
            SELECT TOP (@limit)
                hc.id, hc.check_date, hc.check_time, hc.shift, hc.overall_pass, hc.notes,
                hc.is_absent, hc.session_id, hc.created_at,
                e.id as employee_id, e.name as employee_name, e.gender as employee_gender,
                e.position as employee_position,
                u.display_name as checked_by_name,
                s.document_number
            FROM HygieneChecklists hc
            JOIN Employees e ON hc.employee_id = e.id
            JOIN Users u ON hc.checked_by = u.id
            LEFT JOIN HygieneChecklistSessions s ON hc.session_id = s.id
            WHERE 1=1
        `;
        
        const request = pool.request();
        request.input('limit', sql.Int, parseInt(limit));
        
        if (employee_id) {
            query += ' AND hc.employee_id = @employee_id';
            request.input('employee_id', sql.Int, employee_id);
        }
        
        if (date_from) {
            query += ' AND hc.check_date >= @date_from';
            request.input('date_from', sql.Date, date_from);
        }
        
        if (date_to) {
            query += ' AND hc.check_date <= @date_to';
            request.input('date_to', sql.Date, date_to);
        }
        
        query += ' ORDER BY hc.check_date DESC, hc.check_time DESC';
        
        const result = await request.query(query);
        
        res.json(result.recordset);
    } catch (error) {
        console.error('Error fetching checklists:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Get single checklist with all responses
// ==========================================
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        // Get checklist header
        const checklist = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    hc.id, hc.check_date, hc.check_time, hc.shift, hc.overall_pass, hc.notes,
                    hc.is_absent, hc.session_id, hc.created_at,
                    e.id as employee_id, e.name as employee_name, e.gender as employee_gender,
                    e.position as employee_position,
                    u.display_name as checked_by_name, u.id as checked_by_id,
                    s.document_number
                FROM HygieneChecklists hc
                JOIN Employees e ON hc.employee_id = e.id
                JOIN Users u ON hc.checked_by = u.id
                LEFT JOIN HygieneChecklistSessions s ON hc.session_id = s.id
                WHERE hc.id = @id
            `);
        
        if (checklist.recordset.length === 0) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        
        // Get responses
        const responses = await pool.request()
            .input('checklist_id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    r.id, r.response, r.notes,
                    i.id as item_id, i.name as item_name, i.description as item_description
                FROM HygieneChecklistResponses r
                JOIN HygieneChecklistItems i ON r.item_id = i.id
                WHERE r.checklist_id = @checklist_id
                ORDER BY i.sort_order
            `);
        
        res.json({
            ...checklist.recordset[0],
            responses: responses.recordset
        });
    } catch (error) {
        console.error('Error fetching checklist:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Get statistics
// ==========================================
router.get('/stats/summary', requireAuth, async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        
        const pool = await sql.connect(config.database);
        
        let query = `
            SELECT 
                COUNT(*) as total_sessions,
                SUM(total_employees) as total_checks,
                SUM(total_pass) as passed,
                SUM(total_fail) as failed,
                SUM(total_absent) as absent
            FROM HygieneChecklistSessions
            WHERE 1=1
        `;
        
        const request = pool.request();
        
        if (date_from) {
            query += ' AND check_date >= @date_from';
            request.input('date_from', sql.Date, date_from);
        }
        
        if (date_to) {
            query += ' AND check_date <= @date_to';
            request.input('date_to', sql.Date, date_to);
        }
        
        const result = await request.query(query);
        
        res.json(result.recordset[0] || { total_sessions: 0, total_checks: 0, passed: 0, failed: 0, absent: 0 });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Verify a session (SuperAuditor and Admin only)
// ==========================================
router.put('/sessions/:id/verify', requireAuth, requireRole('SuperAuditor', 'Admin'), async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        // Check if session exists
        const session = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT id, verified FROM HygieneChecklistSessions WHERE id = @id');
        
        if (session.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        if (session.recordset[0].verified) {
            return res.status(400).json({ error: 'Session is already verified' });
        }
        
        // Verify the session
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('verified_by', sql.Int, req.currentUser.id)
            .query(`
                UPDATE HygieneChecklistSessions 
                SET verified = 1, verified_by = @verified_by, verified_at = GETDATE()
                WHERE id = @id
            `);
        
        res.json({ 
            success: true, 
            message: 'Session verified successfully',
            verified_by: req.currentUser.display_name,
            verified_at: new Date()
        });
    } catch (error) {
        console.error('Error verifying session:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Unverify a session (SuperAuditor and Admin only)
// ==========================================
router.put('/sessions/:id/unverify', requireAuth, requireRole('SuperAuditor', 'Admin'), async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                UPDATE HygieneChecklistSessions 
                SET verified = 0, verified_by = NULL, verified_at = NULL
                WHERE id = @id
            `);
        
        res.json({ success: true, message: 'Session unverified successfully' });
    } catch (error) {
        console.error('Error unverifying session:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Update session responses (edit checklist)
// ==========================================
router.put('/sessions/:id', requireAuth, async (req, res) => {
    try {
        const pool = await sql.connect(config.database);
        const { employees } = req.body;
        
        // Check if session exists and get verification status
        const session = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT id, verified, checked_by FROM HygieneChecklistSessions WHERE id = @id');
        
        if (session.recordset.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        const sessionData = session.recordset[0];
        const userRole = (req.currentUser.role || '').toLowerCase();
        const isAdminOrSuper = userRole === 'superauditor' || userRole === 'admin';
        
        // If verified and user is not admin/superauditor, deny
        if (sessionData.verified && !isAdminOrSuper) {
            return res.status(403).json({ error: 'This document is verified and locked. Contact an admin to unlock it.' });
        }
        
        // Update each employee's responses
        for (const emp of employees) {
            // Update checklist overall pass status
            const overallPass = !emp.is_absent && emp.responses.every(r => r.response);
            
            await pool.request()
                .input('id', sql.Int, emp.checklist_id)
                .input('overall_pass', sql.Bit, overallPass)
                .input('is_absent', sql.Bit, emp.is_absent || false)
                .query(`
                    UPDATE HygieneChecklists 
                    SET overall_pass = @overall_pass, is_absent = @is_absent
                    WHERE id = @id
                `);
            
            // Update each response
            for (const r of emp.responses) {
                await pool.request()
                    .input('checklist_id', sql.Int, emp.checklist_id)
                    .input('item_id', sql.Int, r.item_id)
                    .input('response', sql.Bit, r.response)
                    .input('notes', sql.NVarChar, r.corrective_action || null)
                    .query(`
                        UPDATE HygieneChecklistResponses 
                        SET response = @response, notes = @notes
                        WHERE checklist_id = @checklist_id AND item_id = @item_id
                    `);
            }
        }
        
        // Recalculate session totals
        const totals = await pool.request()
            .input('session_id', sql.Int, req.params.id)
            .query(`
                SELECT 
                    COUNT(*) as total_employees,
                    SUM(CASE WHEN is_absent = 1 THEN 1 ELSE 0 END) as total_absent,
                    SUM(CASE WHEN is_absent = 0 AND overall_pass = 1 THEN 1 ELSE 0 END) as total_pass,
                    SUM(CASE WHEN is_absent = 0 AND overall_pass = 0 THEN 1 ELSE 0 END) as total_fail
                FROM HygieneChecklists
                WHERE session_id = @session_id
            `);
        
        const t = totals.recordset[0];
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('total_employees', sql.Int, t.total_employees)
            .input('total_pass', sql.Int, t.total_pass)
            .input('total_fail', sql.Int, t.total_fail)
            .input('total_absent', sql.Int, t.total_absent)
            .query(`
                UPDATE HygieneChecklistSessions 
                SET total_employees = @total_employees, total_pass = @total_pass, 
                    total_fail = @total_fail, total_absent = @total_absent
                WHERE id = @id
            `);
        
        res.json({ success: true, message: 'Checklist updated successfully' });
    } catch (error) {
        console.error('Error updating session:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
