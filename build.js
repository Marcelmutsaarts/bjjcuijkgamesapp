const fs = require('fs');
const path = require('path');

// Read environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Read index.html
const indexPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace placeholders with environment variables
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    html = html.replace(/%%SUPABASE_URL%%/g, SUPABASE_URL);
    html = html.replace(/%%SUPABASE_ANON_KEY%%/g, SUPABASE_ANON_KEY);
    console.log('✅ Environment variables injected into index.html');
} else {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not found in environment variables');
    console.warn('   Using fallback values from app.js');
}

// Write back to index.html
fs.writeFileSync(indexPath, html, 'utf8');
console.log('✅ Build completed');

