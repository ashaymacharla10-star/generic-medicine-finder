/**
 * generate-pages.js
 * Reads medicines from index.html, creates individual medicine pages,
 * and updates sitemap.xml
 * Run: node generate-pages.js
 */

const fs = require('fs');
const path = require('path');

// ─── Read index.html ─────────────────────────────────────────────────────────
const html = fs.readFileSync('index.html', 'utf8');

// Extract the medicines array from the JS source
const startMarker = '// ===== Medicine Database =====';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) { console.error('Could not find medicine database in index.html'); process.exit(1); }

// Find "const medicines = [" after the marker
const arrayStart = html.indexOf('const medicines = [', startIdx);
// Find the closing "];" by counting brackets
let depth = 0, i = html.indexOf('[', arrayStart);
const jsonStart = i;
for (; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) break; }
}
const jsonEnd = i + 1;

// Convert JS object literal to valid JSON
let jsArray = html.slice(jsonStart, jsonEnd);

// Remove JS comments
jsArray = jsArray.replace(/\/\/.*$/gm, '');
// Remove trailing commas before ] or }
jsArray = jsArray.replace(/,(\s*[\]}])/g, '$1');
// Wrap keys in quotes (JS object keys → JSON)
jsArray = jsArray.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

let medicines;
try {
    medicines = JSON.parse(jsArray);
} catch(e) {
    console.error('JSON parse error:', e.message);
    process.exit(1);
}

console.log(`✅ Found ${medicines.length} medicines`);

// ─── Create medicines/ directory ─────────────────────────────────────────────
const outDir = path.join(__dirname, 'medicines');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function categoryName(cat) {
    const map = {
        'fever-pain': 'Fever & Pain', 'antibiotics': 'Antibiotics',
        'diabetes': 'Diabetes', 'bp': 'Blood Pressure', 'acidity': 'Acidity',
        'cold-cough': 'Cold & Cough', 'mental-health': 'Mental Health',
        'skin': 'Skin Care', 'eye-ear': 'Eye & Ear',
        'womens-health': "Women's Health", 'heart': 'Heart',
        'thyroid': 'Thyroid', 'vitamins': 'Vitamins & Supplements',
        'cholesterol': 'Cholesterol', 'asthma': 'Asthma & Respiratory',
        'kidney': 'Kidney', 'liver': 'Liver', 'allergy': 'Allergy',
        'pain': 'Pain Relief', 'neuro': 'Neurology', 'others': 'Others'
    };
    return map[cat] || cat;
}

function safeEncode(str) {
    return encodeURIComponent(str || '');
}

// ─── Generate one page per medicine ──────────────────────────────────────────
const generatedSlugs = [];

medicines.forEach((med, idx) => {
    const medSlug = slug(med.brand);
    generatedSlugs.push(medSlug);

    const genericFirstWord = (med.generic || '').split(' ')[0];
    const searchQuery = safeEncode(med.brand + ' ' + genericFirstWord);
    const brandEncoded = safeEncode(med.brand);

    // Cheapest alternative for savings calc
    const cheapestAlt = med.alternatives && med.alternatives[0];
    const brandPrice = med.priceRange ? parseInt((med.priceRange.match(/₹(\d+)/) || [])[1] || 0) : 0;
    const altPrice = cheapestAlt && cheapestAlt.price ? parseInt((cheapestAlt.price.match(/₹(\d+)/) || [])[1] || 0) : 0;
    const savingsPct = (brandPrice > 0 && altPrice > 0 && brandPrice > altPrice)
        ? Math.round(((brandPrice - altPrice) / brandPrice) * 100) : 0;

    const altRows = (med.alternatives || []).map(alt => `
            <tr>
                <td>${alt.name}</td>
                <td style="color:#27ae60;font-weight:bold;">${alt.price}</td>
                <td><a href="https://www.1mg.com/search/all?name=${safeEncode(alt.name.replace(/\s*\(.*?\)\s*$/, ''))}" target="_blank" rel="noopener" style="color:#667eea;">Buy on 1mg ↗</a></td>
            </tr>`).join('');

    const schemaAlternatives = (med.alternatives || []).map(alt => ({
        "@type": "Product",
        "name": alt.name,
        "offers": { "@type": "Offer", "priceCurrency": "INR", "price": (alt.price.match(/\d+/) || ['0'])[0] }
    }));

    const pageHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${med.brand} Generic Alternative | Save up to ${savingsPct || 70}% | Generic Medicine Finder</title>
    <meta name="description" content="${med.brand} (${med.generic}) costs ${med.priceRange}. Find cheaper generic alternatives${cheapestAlt ? ' like ' + cheapestAlt.name + ' at just ' + cheapestAlt.price : ''}. Save up to ${savingsPct || 70}% on ${med.brand}.">
    <meta name="keywords" content="${med.brand} generic alternative, ${med.brand} cheaper substitute, ${med.generic} price India, ${med.brand} price, generic ${med.generic}, affordable ${med.brand}">
    <link rel="canonical" href="https://generic-med.org/medicines/${medSlug}.html">
    <meta name="robots" content="index, follow">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://generic-med.org/medicines/${medSlug}.html">
    <meta property="og:title" content="${med.brand} Generic Alternative - Save up to ${savingsPct || 70}%">
    <meta property="og:description" content="Find cheaper alternatives for ${med.brand} (${med.generic}). Compare prices and save money.">
    <meta property="og:image" content="https://generic-med.org/og-image.png">

    <!-- Schema.org -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "MedicalWebPage",
        "name": "${med.brand} Generic Alternative",
        "url": "https://generic-med.org/medicines/${medSlug}.html",
        "description": "${med.brand} (${med.generic}) - ${med.usage}. Find cheaper generic alternatives in India.",
        "mainEntity": {
            "@type": "Drug",
            "name": "${med.brand}",
            "alternateName": "${med.generic}",
            "description": "${med.usage}",
            "relevantSpecialty": "${categoryName(med.category)}"
        },
        "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://generic-med.org/"},
                {"@type": "ListItem", "position": 2, "name": "${categoryName(med.category)}", "item": "https://generic-med.org/#${med.category}"},
                {"@type": "ListItem", "position": 3, "name": "${med.brand}", "item": "https://generic-med.org/medicines/${medSlug}.html"}
            ]
        }
    }
    </script>

    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .back-link { color: white; text-decoration: none; font-size: 14px; display: inline-block; margin-bottom: 15px; opacity: 0.9; }
        .back-link:hover { opacity: 1; text-decoration: underline; }
        .card { background: white; border-radius: 16px; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); margin-bottom: 20px; }
        h1 { color: #333; font-size: 2em; margin-bottom: 8px; }
        .generic-badge { background: #f0f4ff; color: #667eea; padding: 6px 14px; border-radius: 20px; display: inline-block; font-weight: 600; margin-bottom: 16px; }
        .category-badge { background: #764ba2; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; display: inline-block; margin-left: 8px; }
        .usage { color: #555; line-height: 1.7; margin-bottom: 20px; font-size: 15px; }
        .price-box { background: #fff3cd; border: 2px solid #ffc107; border-radius: 10px; padding: 16px; margin-bottom: 20px; }
        .price-label { font-size: 13px; color: #856404; font-weight: 600; margin-bottom: 4px; }
        .price-value { font-size: 1.5em; font-weight: bold; color: #333; }
        .savings-badge { background: #d4edda; border: 2px solid #28a745; border-radius: 10px; padding: 14px; margin-bottom: 20px; color: #155724; }
        h2 { color: #333; margin-bottom: 16px; font-size: 1.3em; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #667eea; color: white; padding: 12px; text-align: left; }
        td { padding: 12px; border-bottom: 1px solid #eee; }
        tr:hover td { background: #f8f9ff; }
        .pharmacy-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
        .ph-btn { padding: 12px; border-radius: 8px; text-align: center; text-decoration: none; color: white; font-weight: 600; font-size: 13px; display: block; transition: opacity 0.2s; }
        .ph-btn:hover { opacity: 0.85; }
        .faq-item { margin-bottom: 20px; }
        .faq-q { font-weight: bold; color: #333; margin-bottom: 6px; }
        .faq-a { color: #555; line-height: 1.6; }
        footer-note { display: block; color: rgba(255,255,255,0.85); font-size: 12px; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 16px; }
        @media (max-width: 600px) { h1 { font-size: 1.5em; } .pharmacy-grid { grid-template-columns: repeat(2, 1fr); } }
    </style>

    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-LJCB050JVS"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-LJCB050JVS');
    </script>

    <!-- Microsoft Clarity -->
    <script type="text/javascript">
        (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "vh2mybby3f");
    </script>
</head>
<body>
<div class="container">
    <a href="https://generic-med.org/" class="back-link">← Back to Generic Medicine Finder</a>

    <div class="card">
        <div class="category-badge">${categoryName(med.category)}</div>
        <h1>💊 ${med.brand}</h1>
        <div class="generic-badge">Generic: ${med.generic}</div>
        <p class="usage">${med.usage}</p>

        <div class="price-box">
            <div class="price-label">💰 Branded Price (${med.brand})</div>
            <div class="price-value">${med.priceRange}</div>
        </div>

        ${savingsPct > 0 ? `
        <div class="savings-badge">
            🎉 <strong>You can save up to ${savingsPct}%</strong> by switching to a generic alternative!
            ${cheapestAlt ? `Cheapest option: <strong>${cheapestAlt.name}</strong> at <strong>${cheapestAlt.price}</strong>` : ''}
        </div>` : ''}
    </div>

    <div class="card">
        <h2>✅ Cheaper Generic Alternatives for ${med.brand}</h2>
        <table>
            <thead><tr><th>Medicine Name</th><th>Price</th><th>Buy Online</th></tr></thead>
            <tbody>${altRows}</tbody>
        </table>
        <p style="font-size:12px;color:#888;">⚠️ Prices are approximate. Always consult your doctor before switching medicines.</p>
    </div>

    <div class="card">
        <h2>🏪 Buy ${med.brand} Online</h2>
        <p style="color:#666;font-size:14px;margin-bottom:12px;">Compare prices across all major Indian pharmacies:</p>
        <div class="pharmacy-grid">
            <a href="https://www.1mg.com/search/all?name=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#ee4036;">1mg</a>
            <a href="https://www.apollopharmacy.in/search-medicines?search_query=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#0072bb;">Apollo</a>
            <a href="https://pharmeasy.in/search/all?name=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#5f27cd;">PharmEasy</a>
            <a href="https://www.netmeds.com/catalogsearch/result?q=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#24AEB1;">Netmeds</a>
            <a href="https://www.medplusmart.com/searchProduct?searchKey=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#E53E3E;">MedPlus</a>
            <a href="https://www.truemeds.in/search?search=${brandEncoded}" target="_blank" rel="noopener" class="ph-btn" style="background:#00B4D8;">Truemeds</a>
        </div>
    </div>

    <div class="card">
        <h2>❓ Frequently Asked Questions</h2>
        <div class="faq-item">
            <div class="faq-q">What is the generic name of ${med.brand}?</div>
            <div class="faq-a">The generic name of ${med.brand} is <strong>${med.generic}</strong>. Generic medicines contain the same active ingredient and work exactly the same way as branded medicines.</div>
        </div>
        <div class="faq-item">
            <div class="faq-q">Is ${med.brand} generic alternative safe?</div>
            <div class="faq-a">Yes. Generic medicines are approved by the Central Drugs Standard Control Organisation (CDSCO) and contain the same active ingredient (${med.generic}) in the same dosage. Always consult your doctor before switching.</div>
        </div>
        ${cheapestAlt ? `
        <div class="faq-item">
            <div class="faq-q">What is the cheapest alternative to ${med.brand}?</div>
            <div class="faq-a"><strong>${cheapestAlt.name}</strong> is one of the cheapest alternatives at <strong>${cheapestAlt.price}</strong>, compared to ${med.brand} at ${med.priceRange}.</div>
        </div>` : ''}
        <div class="faq-item">
            <div class="faq-q">What is ${med.brand} used for?</div>
            <div class="faq-a">${med.usage}</div>
        </div>
    </div>

    <div class="card" style="text-align:center;">
        <p style="color:#666;margin-bottom:12px;">🔍 Search 300+ more medicines for generic alternatives</p>
        <a href="https://generic-med.org/" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">Find More Generic Medicines →</a>
    </div>

    <footer-note>
        ⚠️ <strong>Disclaimer:</strong> This information is for educational purposes only. Always consult your doctor or pharmacist before switching or stopping any medicine. Prices are approximate and may vary.
        <br><br>
        <a href="https://generic-med.org/" style="color:white;text-decoration:underline;">Generic Medicine Finder</a> — Helping Indians save money on healthcare.
    </footer-note>
</div>
</body>
</html>`;

    fs.writeFileSync(path.join(outDir, `${medSlug}.html`), pageHTML, 'utf8');
});

console.log(`✅ Generated ${generatedSlugs.length} individual medicine pages in /medicines/`);

// ─── Update sitemap.xml ───────────────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];

const medUrls = generatedSlugs.map(s => `    <url>
        <loc>https://generic-med.org/medicines/${s}.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.9</priority>
    </url>`).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://generic-med.org/</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>https://generic-med.org/about.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.8</priority>
    </url>
    <url>
        <loc>https://generic-med.org/privacy.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.5</priority>
    </url>
${medUrls}
</urlset>`;

fs.writeFileSync('sitemap.xml', sitemap, 'utf8');
console.log(`✅ sitemap.xml updated with ${generatedSlugs.length + 3} URLs`);

// ─── Create medicines/index.html (browse all medicines) ──────────────────────
const categoryGroups = {};
medicines.forEach(m => {
    const cat = categoryName(m.category);
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(m);
});

const categoryBlocks = Object.entries(categoryGroups).map(([cat, meds]) => `
    <section style="margin-bottom:30px;">
        <h2 style="color:#667eea;margin-bottom:12px;border-bottom:2px solid #667eea;padding-bottom:8px;">${cat}</h2>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${meds.map(m => `<a href="${slug(m.brand)}.html" style="background:white;padding:8px 14px;border-radius:20px;text-decoration:none;color:#333;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.1);transition:all 0.2s;" onmouseover="this.style.background='#667eea';this.style.color='white'" onmouseout="this.style.background='white';this.style.color='#333'">${m.brand}</a>`).join('')}
        </div>
    </section>`).join('');

const indexPage = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>All Generic Medicines - Find Cheaper Alternatives | Generic Medicine Finder</title>
    <meta name="description" content="Browse 300+ branded medicines and find cheaper generic alternatives. Search by category - fever, antibiotics, diabetes, blood pressure, and more.">
    <link rel="canonical" href="https://generic-med.org/medicines/">
    <meta name="robots" content="index, follow">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        .card { background: white; border-radius: 16px; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        .back-link { color: white; text-decoration: none; font-size: 14px; display: inline-block; margin-bottom: 15px; }
        .back-link:hover { text-decoration: underline; }
        h1 { color: #333; margin-bottom: 8px; }
        .subtitle { color: #666; margin-bottom: 24px; }
    </style>

    <!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-LJCB050JVS"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-LJCB050JVS');
    </script>

    <!-- Microsoft Clarity -->
    <script type="text/javascript">
        (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "vh2mybby3f");
    </script>
</head>
<body>
<div class="container">
    <a href="https://generic-med.org/" class="back-link">← Back to Search</a>
    <div class="card">
        <h1>💊 All Generic Medicines (${medicines.length})</h1>
        <p class="subtitle">Click any medicine to find cheaper generic alternatives and compare prices.</p>
        ${categoryBlocks}
    </div>
</div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'index.html'), indexPage, 'utf8');
console.log(`✅ medicines/index.html created (browse page for all medicines)`);

console.log('\n🎉 Done! Next steps:');
console.log('   1. Deploy to your server');
console.log('   2. Submit sitemap to Google Search Console: https://search.google.com/search-console');
console.log('   3. Submit sitemap URL: https://generic-med.org/sitemap.xml');
