require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Módulos específicos para cada tipo de documento
const actaConstitutiva = require('./modules/acta-constitutiva');
const listaBloqueados = require('./modules/lista-bloqueados');

const app = express();
const port = process.env.PORT || 3000;
const basePath = '/kyc-ocr-extractor'; // Base path para todas las rutas

// Configuración del motor de plantillas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
// Servir archivos estáticos con el base path correcto
app.use(`${basePath}`, express.static('public'));

/**
 * Configuración de almacenamiento para Multer
 * Este middleware gestiona la carga de archivos al servidor
 * @type {Object}
 */
const storage = multer.diskStorage({
    /**
     * Define el directorio donde se guardarán los archivos cargados
     * @param {Object} req - Objeto de solicitud Express
     * @param {Object} file - Archivo cargado
     * @param {Function} cb - Función de callback
     */
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    /**
     * Define el nombre del archivo guardado
     * @param {Object} req - Objeto de solicitud Express
     * @param {Object} file - Archivo cargado
     * @param {Function} cb - Función de callback
     */
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

/**
 * Configuración de Multer para gestionar la carga de archivos
 * Incluye filtro para validar tipos de archivos permitidos
 */
const upload = multer({ 
    storage: storage,
    /**
     * Filtra los tipos de archivos permitidos
     * @param {Object} req - Objeto de solicitud Express
     * @param {Object} file - Archivo cargado
     * @param {Function} cb - Función de callback
     */
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no soportado. Solo se permiten PDF, JPG, JPEG y PNG.'));
        }
    }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Rutas para las vistas con el base path
app.get(`${basePath}/`, (req, res) => {
    res.render('index', { 
        title: 'Extractores de Documentos',
        basePath: basePath 
    });
});

app.get(`${basePath}/acta-constitutiva`, (req, res) => {
    res.render('acta-constitutiva', { 
        title: 'Extractor de Actas Constitutivas',
        basePath: basePath,
        customStyles: '.spinner-border.d-none { display: none !important; }' 
    });
});

app.get(`${basePath}/lista-bloqueados`, (req, res) => {
    res.render('lista-bloqueados', { 
        title: 'Extractor de Listas de Personas Bloqueadas',
        basePath: basePath,
        customStyles: '.spinner-border.d-none { display: none !important; }' 
    });
});

/**
 * Ruta API para procesar documentos cargados
 * Maneja la carga del archivo, procesamiento OCR y análisis con IA
 * @route POST /api/upload
 */
app.post(`${basePath}/api/upload`, upload.single('document'), async (req, res) => {
    const tempFilesToDelete = [];
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo' });
        }

        const filePath = req.file.path;
        const fileType = req.file.mimetype;
        const documentType = req.body.documentType || 'acta-constitutiva'; // Tipo de documento por defecto
        
        tempFilesToDelete.push(filePath);
        
        try {
            console.log(`Procesando documento de tipo: ${documentType}`);
            console.log('Realizando OCR...');
            
            let ocrResult;
            let extractedData;
            
            // Elegir el procesador según el tipo de documento
            switch (documentType) {
                case 'lista-bloqueados':
                    ocrResult = await listaBloqueados.processOCR(filePath, fileType);
                    tempFilesToDelete.push(...ocrResult.tempFiles);
                    
                    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
                        throw new Error('No se pudo extraer texto del documento. Por favor, asegúrate de que el documento sea legible.');
                    }
                    
                    console.log('Procesando con AI...');
                    extractedData = await listaBloqueados.processWithAI(ocrResult.text);
                    break;
                    
                case 'acta-constitutiva':
                default:
                    ocrResult = await actaConstitutiva.processOCR(filePath, fileType);
                    tempFilesToDelete.push(...ocrResult.tempFiles);
                    
                    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
                        throw new Error('No se pudo extraer texto del documento. Por favor, asegúrate de que el documento sea legible.');
                    }
                    
                    console.log('Procesando con AI...');
                    extractedData = await actaConstitutiva.processWithAI(ocrResult.text);
                    break;
            }

            // Responder al cliente
            res.json({
                success: true,
                data: extractedData
            });
            
            // Limpiar archivos temporales después de enviar la respuesta
            const cleanupFunction = documentType === 'lista-bloqueados' 
                ? listaBloqueados.cleanupTempFiles 
                : actaConstitutiva.cleanupTempFiles;
                
            cleanupFunction(tempFilesToDelete);
        } catch (error) {
            // Limpiar archivos temporales en caso de error
            const cleanupFunction = documentType === 'lista-bloqueados' 
                ? listaBloqueados.cleanupTempFiles 
                : actaConstitutiva.cleanupTempFiles;
                
            cleanupFunction(tempFilesToDelete);
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: error.message || 'Error al procesar el documento',
            details: error.stack
        });
    }
});

/**
 * Inicia el servidor Express en el puerto especificado
 * Escucha solicitudes entrantes y muestra mensaje en consola
 */
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}${basePath}`);
}); 