/**
 * Sistema de verificación de compatibilidad del sistema operativo
 * Este módulo se carga al inicio de la aplicación para asegurar que
 * todos los requisitos del sistema están cubiertos.
 */

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

/**
 * Verifica si el sistema operativo es compatible
 * @returns {boolean} - true si es compatible, false si no
 */
function checkOSCompatibility() {
    const platform = os.platform();
    console.log(`Sistema operativo detectado: ${platform}`);
    
    // Verificar sistemas operativos soportados
    if (platform === 'darwin') {
        console.log('macOS detectado - compatible.');
        return true;
    } else if (platform === 'linux') {
        console.log('Linux detectado - verificando requisitos...');
        // Comprobar si poppler está instalado en Linux
        try {
            const popplerVersion = execSync('pdftocairo -v 2>&1', { encoding: 'utf8' });
            console.log(`Poppler instalado: ${popplerVersion.trim()}`);
            return true;
        } catch (error) {
            console.error('ERROR: Poppler no está instalado en este sistema Linux.');
            console.error('Por favor, instale poppler-utils con su gestor de paquetes:');
            console.error('  Ubuntu/Debian: sudo apt-get install poppler-utils');
            console.error('  Fedora/RHEL: sudo dnf install poppler-utils');
            return false;
        }
    } else if (platform === 'win32') {
        console.error('Windows detectado - actualmente no compatible.');
        console.error('Se recomienda usar macOS o Linux para esta aplicación.');
        return false;
    } else {
        console.error(`Sistema operativo ${platform} no soportado.`);
        return false;
    }
}

// Exportar la función principal
module.exports = {
    checkOSCompatibility
}; 