/**
 * FS Monitoring Application
 * Food Safety Monitoring System
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Import auth module
const { initializeAuth, requireAuth, requireRole } = require('./auth/auth-server');

// Import modules
const hygieneChecklistModule = require('./modules/hygiene-checklist');
const equipmentCalibrationModule = require('./modules/equipment-calibration');
const fryingOilModule = require('./modules/frying-oil');
const foodSafetyModule = require('./modules/food-safety');
const dryStoreModule = require('./modules/dry-store');
const waterQualityModule = require('./modules/water-quality');
const atpMonitoringModule = require('./modules/atp-monitoring');
const hotHoldingModule = require('./modules/hot-holding');
const dryStoreExpiryModule = require('./modules/dry-store-expiry');
const cookingCoolingModule = require('./modules/cooking-cooling');
const fridgeTempModule = require('./modules/fridge-temp');
const vegFruitWashModule = require('./modules/veg-fruit-wash');
const qualityControlReceivingModule = require('./modules/quality-control-receiving');
const recipeVerificationModule = require('./modules/recipe-verification');
const endProductChecklistModule = require('./modules/end-product-checklist');
const pasteurizedJuicesModule = require('./modules/pasteurized-juices');
const trucksDispatchingModule = require('./modules/trucks-dispatching');
const glassPlasticInspectionModule = require('./modules/glass-plastic-inspection');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CRITICAL: Prevent caching for all authenticated routes
// This fixes the session sharing issue where one user sees another user's cached data
app.use((req, res, next) => {
    // Don't cache any pages that require authentication
    const noCacheRoutes = ['/dashboard', '/home', '/admin', '/auditor', '/hygiene-checklist', 
                           '/equipment-calibration', '/frying-oil', '/food-safety', '/dry-store',
                           '/water-quality', '/atp-monitoring', '/hot-holding', '/dry-store-expiry',
                           '/cooking-cooling', '/fridge-temp', '/veg-fruit-wash', '/quality-control-receiving', '/recipe-verification', '/end-product-checklist', '/pasteurized-juices', '/trucks-dispatching', '/glass-plastic-inspection'];
    
    const shouldNotCache = noCacheRoutes.some(route => req.path.startsWith(route));
    
    if (shouldNotCache) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Vary', 'Cookie'); // Vary by cookie to ensure proper cache separation
    }
    next();
});

// Initialize Authentication
initializeAuth(app);

// ==========================================
// Module Routes
// ==========================================

// Hygiene Checklist Module (with /hygiene-checklist prefix)
app.use('/hygiene-checklist', requireAuth, hygieneChecklistModule);

// Equipment Calibration Module (with /equipment-calibration prefix)
app.use('/equipment-calibration', requireAuth, equipmentCalibrationModule);

// Frying Oil Verification Module (with /frying-oil prefix)
app.use('/frying-oil', requireAuth, fryingOilModule);

// Food Safety Verification Module (with /food-safety prefix)
app.use('/food-safety', requireAuth, foodSafetyModule);

// Dry Store Temperature & Humidity Module (with /dry-store prefix)
app.use('/dry-store', requireAuth, dryStoreModule);

// Water Quality Monitoring Module (with /water-quality prefix)
app.use('/water-quality', requireAuth, waterQualityModule);

// ATP Monitoring Module (with /atp-monitoring prefix)
app.use('/atp-monitoring', requireAuth, atpMonitoringModule);

// Hot Holding Quality Control Module (with /hot-holding prefix)
app.use('/hot-holding', requireAuth, hotHoldingModule);

// Dry Store Expiry Check Module (with /dry-store-expiry prefix)
app.use('/dry-store-expiry', requireAuth, dryStoreExpiryModule);

// Cooking and Cooling Temperature Module (with /cooking-cooling prefix)
app.use('/cooking-cooling', requireAuth, cookingCoolingModule);

// Fridge Temperature Monitoring Module (with /fridge-temp prefix)
app.use('/fridge-temp', requireAuth, fridgeTempModule);

// Vegetables & Fruits Washing Monitoring Module (with /veg-fruit-wash prefix)
app.use('/veg-fruit-wash', requireAuth, vegFruitWashModule);

// Quality Control Receiving Checklist Module (Form 13) (with /quality-control-receiving prefix)
app.use('/quality-control-receiving', requireAuth, qualityControlReceivingModule);

// Recipe Verification Checklist Module (with /recipe-verification prefix)
app.use('/recipe-verification', requireAuth, recipeVerificationModule);

// End-Product Checklist Module (with /end-product-checklist prefix)
app.use('/end-product-checklist', requireAuth, endProductChecklistModule);

// Pasteurized Juices Checklist Module (with /pasteurized-juices prefix)
app.use('/pasteurized-juices', requireAuth, pasteurizedJuicesModule);

// Trucks Dispatching Module (with /trucks-dispatching prefix)
app.use('/trucks-dispatching', requireAuth, trucksDispatchingModule);

// Glass & Plastic Inspection Module (with /glass-plastic-inspection prefix)
app.use('/glass-plastic-inspection', requireAuth, glassPlasticInspectionModule);

// ==========================================
// Page Routes
// ==========================================

// Public home page (login page)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${process.env.APP_NAME || 'FS Monitoring'}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0;
                    padding: 1rem;
                }
                .card {
                    background: white;
                    border-radius: 16px;
                    padding: 3rem 2rem;
                    text-align: center;
                    max-width: 400px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                }
                h1 { color: #1e3a8a; margin-bottom: 0.5rem; }
                p { color: #6b7280; margin-bottom: 2rem; }
                .btn { 
                    display: inline-block;
                    padding: 1rem 2rem; 
                    background: #2563eb; 
                    color: white; 
                    text-decoration: none; 
                    border-radius: 10px;
                    font-weight: 600;
                    transition: all 0.2s;
                }
                .btn:hover { background: #1d4ed8; transform: translateY(-2px); }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🍽️ FS Monitoring</h1>
                <p>Food Safety Monitoring System</p>
                <a href="/auth/login" class="btn">Login with Microsoft</a>
            </div>
        </body>
        </html>
    `);
});

// Main dashboard after login - shows app cards
app.get('/dashboard', requireAuth, (req, res) => {
    // Prevent caching to ensure fresh content
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

// Home route (alias for dashboard)
app.get('/home', requireAuth, (req, res) => {
    // Prevent caching to ensure fresh content
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'views', 'home.html'));
});

// Legacy routes - redirect to module paths
app.get('/employees', requireAuth, (req, res) => {
    res.redirect('/hygiene-checklist/employees');
});

app.get('/checklist-items', requireAuth, (req, res) => {
    res.redirect('/hygiene-checklist/items');
});

app.get('/audit/new', requireAuth, (req, res) => {
    res.redirect('/hygiene-checklist');
});

// Admin-only route
app.get('/admin', requireAuth, requireRole('Admin'), (req, res) => {
    res.send('Admin Panel - Only admins can see this');
});

// ==========================================
// Start Server
// ==========================================

const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

const USE_HTTPS = SSL_KEY_PATH && SSL_CERT_PATH && 
                  fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH);

if (USE_HTTPS) {
    const httpsOptions = {
        key: fs.readFileSync(SSL_KEY_PATH),
        cert: fs.readFileSync(SSL_CERT_PATH)
    };
    
    if (process.env.SSL_CA_PATH && fs.existsSync(process.env.SSL_CA_PATH)) {
        httpsOptions.ca = fs.readFileSync(process.env.SSL_CA_PATH);
    }
    
    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`🚀 ${process.env.APP_NAME} running on ${APP_URL}`);
    });
} else {
    http.createServer(app).listen(PORT, () => {
        console.log(`🚀 ${process.env.APP_NAME} running on ${APP_URL}`);
        console.log('⚠️  Running in HTTP mode (SSL not configured)');
    });
}

module.exports = app;
