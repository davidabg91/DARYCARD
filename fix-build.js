import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, 'dist');

console.log('🛡️ Starting Universal Post-Build Fix...');

function processDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            processDirectory(filePath);
        } else if (file.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf8');
            let modified = false;
            
            if (content.includes('import.meta.resolve')) {
                console.log(`✅ Fixing import.meta in JS: ${file}`);
                content = content.replace(/import\.meta\.resolve/g, '(undefined)');
                modified = true;
            }

            if (file.includes('index-legacy')) {
                console.log(`📡 Injecting Advanced Diagnostics into ${file}`);
                // 1. Absolute top of file
                content = 'alert("BUNDLE PHYSICAL START: ' + file + '"); ' + content;
                
                // 2. Inside System.register execution (where the app actually starts running)
                content = content.replace('execute:function(){', 'execute:function(){ alert("BUNDLE EXECUTION STARTED"); ');
                
                // 3. Before the main.tsx diagnostic string
                content = content.replace('STEP 3: MAIN.TSX EXECUTING', 'STEP 3: MAIN.TSX REACHED IN BUNDLE');
                
                modified = true;
            }

            if (modified) {
                fs.writeFileSync(filePath, content, 'utf8');
            }
        } else if (file === 'index.html') {
            console.log(`🏗️ Forcing Legacy Mode in index.html...`);
            let content = fs.readFileSync(filePath, 'utf8');
            
            // 1. Force remove any remaining type="module" tags
            content = content.replace(/<script type="module".*?><\/script>/g, '');
            content = content.replace(/<script type="module">.*?<\/script>/gs, '');
            
            // 2. Make legacy scripts load (remove nomodule)
            const v = Date.now();
            content = content.replace(/nomodule /g, '');
            
            // 3. Convert Absolute paths to Relative (Essential for Capacitor/Android)
            content = content.replace(/src="\/assets\//g, 'src="assets/');
            content = content.replace(/href="\/assets\//g, 'href="assets/');
            content = content.replace(/data-src="\/assets\//g, 'data-src="assets/');
            
            // 4. Link my custom loader to Vite's output
            content = content.replace(/<script[^>]*id="vite-legacy-entry"[^>]*data-src="([^"]+)"[^>]*>.*?<\/script>/gs, (match, p1) => {
                // p1 is Vite's generated path for the legacy entry
                const relativePath = p1.replace(/^\//, '');
                return `<script id="vite-legacy-entry-data" data-src="${relativePath}"></script>`;
            });

            // 5. Simple Versioning
            content = content.replace(/src="([^"]+?\.js)"/g, (match, p1) => {
                if (p1.includes('?')) return match;
                return `src="${p1}?v=${v}"`;
            });
            content = content.replace(/href="([^"]+?\.css)"/g, (match, p1) => {
                if (p1.includes('?')) return match;
                return `href="${p1}?v=${v}"`;
            });

            // 6. Fix system.min.js specifically
            content = content.replace(/s\.src = "system\.min\.js"/g, `s.src = "system.min.js?v=${v}"`);
            
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ index.html transformed with Versioning: v=${v}`);
        }
    });
}

processDirectory(distPath);
console.log('🚀 Universal Fix complete!');
