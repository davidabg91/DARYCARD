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
            if (content.includes('import.meta.resolve')) {
                console.log(`✅ Fixing JS: ${file}`);
                content = content.replace(/import\.meta\.resolve/g, '(undefined)');
                fs.writeFileSync(filePath, content, 'utf8');
            }
        } else if (file === 'index.html') {
            console.log(`🏗️ Forcing Legacy Mode in index.html...`);
            let content = fs.readFileSync(filePath, 'utf8');
            
            // Remove modern module scripts
            content = content.replace(/<script type="module" crossorigin src="\/assets\/index-.*?\.js"><\/script>/g, '');
            
            // Remove the modern browser check script block
            content = content.replace(/<script type="module">!function\(\)\{if\(window\.__vite_is_modern_browser\)return;.*?<\/script>/g, '');
            content = content.replace(/<script type="module">import'data:text\/javascript,if\(!import\.meta\.resolve\).*?<\/script>/g, '');
            
            // Make the legacy polyfill and entry point load normally (remove nomodule)
            const v = Date.now();
            content = content.replace(/nomodule /g, '');
            content = content.replace(/data-src="(.*?)"/g, (match, p1) => `src="${p1}?v=${v}"`);
            
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ index.html transformed to Force Legacy Mode.`);
        }
    });
}

processDirectory(distPath);
console.log('🚀 Universal Fix complete!');
