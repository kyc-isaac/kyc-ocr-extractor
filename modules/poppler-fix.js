/**
 * Módulo para solucionar problemas con poppler en macOS
 * Proporciona funciones alternativas que utilizan el binario de poppler
 * instalado por Homebrew en lugar del incluido en el módulo de node
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

/**
 * Verifica si poppler está instalado correctamente en el sistema
 * @returns {Object} Objeto con información sobre la instalación de poppler
 */
function checkPopplerInstallation() {
    console.log('[POPPLER-FIX] Verificando instalación de poppler...');
    
    const result = {
        isInstalled: false,
        binaryPath: null,
        isHomebrewVersion: false,
        version: null,
        error: null
    };
    
    try {
        // Verificar posibles rutas del binario pdftocairo
        const possiblePaths = [
            '/opt/homebrew/bin/pdftocairo',     // Apple Silicon (M1/M2) Homebrew
            '/usr/local/bin/pdftocairo',        // Intel Mac Homebrew
            '/usr/bin/pdftocairo',              // Instalación del sistema (raro en macOS)
            path.join(__dirname, '../node_modules/pdf-poppler/lib/osx/poppler-0.66/bin/pdftocairo') // Incluido en node_modules
        ];
        
        for (const binPath of possiblePaths) {
            if (fs.existsSync(binPath)) {
                result.isInstalled = true;
                result.binaryPath = binPath;
                result.isHomebrewVersion = binPath.includes('/homebrew/') || binPath.includes('/local/');
                
                try {
                    // Intentar obtener la versión
                    const versionOutput = execSync(`${binPath} -v`, { encoding: 'utf8' });
                    const versionMatch = versionOutput.match(/pdftocairo version ([0-9.]+)/i);
                    if (versionMatch && versionMatch[1]) {
                        result.version = versionMatch[1];
                    }
                } catch (versionError) {
                    console.log('[POPPLER-FIX] No se pudo obtener la versión de poppler');
                }
                
                break;
            }
        }
        
        if (!result.isInstalled) {
            result.error = "No se encontró ninguna instalación de poppler";
            console.error('[POPPLER-FIX] ' + result.error);
        } else {
            console.log(`[POPPLER-FIX] Poppler encontrado en: ${result.binaryPath}, versión: ${result.version}`);
        }
    } catch (error) {
        result.error = error.message;
        console.error('[POPPLER-FIX] Error verificando instalación:', error);
    }
    
    return result;
}

/**
 * Función alternativa a poppler.convert que utiliza directamente el binario del sistema
 * @param {string} pdfPath - Ruta del archivo PDF a convertir
 * @param {Object} options - Opciones de conversión
 * @returns {Promise<string[]>} - Array con las rutas de las imágenes generadas
 */
async function convertPDFToImages(pdfPath, options = {}) {
    console.log('[POPPLER-FIX] Iniciando conversión PDF a imágenes para:', pdfPath);
    
    const popplerInfo = checkPopplerInstallation();
    if (!popplerInfo.isInstalled) {
        throw new Error('No se encontró poppler instalado. Por favor instálalo con: brew install poppler');
    }
    
    const pdftocairo = popplerInfo.binaryPath;
    const opts = {
        format: options.format || 'png',
        out_dir: options.out_dir || 'uploads',
        out_prefix: options.out_prefix || path.basename(pdfPath, '.pdf'),
        page: options.page || null,
        scale: options.scale || 2.0
    };
    
    // Crear directorio de salida si no existe
    if (!fs.existsSync(opts.out_dir)) {
        fs.mkdirSync(opts.out_dir, { recursive: true });
    }
    
    const outputPrefix = path.join(opts.out_dir, opts.out_prefix);
    
    try {
        let command = `"${pdftocairo}" -${opts.format}`;
        
        // Agregar opciones específicas
        if (opts.scale) {
            command += ` -scale-to-x ${Math.round(1024 * opts.scale)} -scale-to-y ${Math.round(1024 * opts.scale)}`;
        }
        
        if (opts.page !== null) {
            command += ` -f ${opts.page} -l ${opts.page}`;
        }
        
        command += ` "${pdfPath}" "${outputPrefix}"`;
        
        console.log('[POPPLER-FIX] Ejecutando comando:', command);
        
        const { stdout, stderr } = await exec(command);
        if (stderr) {
            console.warn('[POPPLER-FIX] Advertencias al ejecutar pdftocairo:', stderr);
        }
        
        // Listar archivos generados
        const files = fs.readdirSync(opts.out_dir);
        const generatedImages = files
            .filter(file => 
                file.startsWith(opts.out_prefix) && 
                file !== path.basename(pdfPath) && // Excluir el PDF original
                file.endsWith(`.${opts.format}`)
            )
            .map(file => path.join(opts.out_dir, file));
        
        console.log('[POPPLER-FIX] Imágenes generadas:', generatedImages.length);
        return generatedImages;
    } catch (error) {
        console.error('[POPPLER-FIX] Error en la conversión:', error);
        throw new Error(`Error al convertir PDF a imágenes: ${error.message}`);
    }
}

module.exports = {
    checkPopplerInstallation,
    convertPDFToImages
}; 