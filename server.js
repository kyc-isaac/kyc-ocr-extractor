require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const poppler = require('pdf-poppler');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no soportado. Solo se permiten PDF, JPG, JPEG y PNG.'));
        }
    }
});

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Función para convertir PDF a imágenes
async function convertPDFToImages(pdfPath) {
    try {
        const opts = {
            format: 'jpeg',
            out_dir: 'uploads',
            out_prefix: path.basename(pdfPath, '.pdf'),
            page: null // Convert all pages
        };

        await poppler.convert(pdfPath, opts);
        
        // Get all generated image files
        const files = fs.readdirSync('uploads');
        return files
            .filter(file => file.startsWith(path.basename(pdfPath, '.pdf')))
            .map(file => path.join('uploads', file));
    } catch (error) {
        console.error('Error al convertir PDF a imágenes:', error);
        throw new Error('Error al convertir PDF a imágenes: ' + error.message);
    }
}

// OCR Processing with OpenAI
async function processOCR(filePath, fileType) {
    try {
        if (fileType === 'application/pdf') {
            // Convertir PDF a imágenes
            const imagePaths = await convertPDFToImages(filePath);
            let allText = '';
            
            for (const imagePath of imagePaths) {
                try {
                    // Procesar cada imagen
                    const imageBuffer = await sharp(imagePath)
                        .resize(1500, 1500, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 70 })
                        .toBuffer();
                    
                    const base64Data = imageBuffer.toString('base64');
                    
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Extrae todo el texto del siguiente documento en español, incluyendo nombres, fechas, números y cualquier información relevante."
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: `data:image/jpeg;base64,${base64Data}`
                                        }
                                    }
                                ]
                            }
                        ],
                        max_tokens: 4000
                    });
                    
                    allText += response.choices[0].message.content + '\n\n';
                } catch (imageError) {
                    console.warn(`Error al procesar imagen ${imagePath}: ${imageError.message}`);
                    // Continuar con la siguiente imagen
                }
                
                // Limpiar archivo temporal - manejar errores de permisos
                try {
                    fs.unlinkSync(imagePath);
                } catch (unlinkError) {
                    console.warn(`No se pudo eliminar el archivo temporal ${imagePath}: ${unlinkError.message}`);
                    // Programar eliminación posterior
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(imagePath)) {
                                fs.unlinkSync(imagePath);
                            }
                        } catch (e) {
                            console.warn(`No se pudo eliminar el archivo temporal ${imagePath} en el segundo intento`);
                        }
                    }, 5000); // Intentar de nuevo después de 5 segundos
                }
            }
            
            if (!allText.trim()) {
                throw new Error('No se pudo extraer texto de ninguna de las páginas del PDF');
            }
            
            return allText;
        } else {
            // Procesar imagen directamente
            const fileBuffer = fs.readFileSync(filePath);
            try {
                const imageBuffer = await sharp(fileBuffer)
                    .resize(1500, 1500, {
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 70 })
                    .toBuffer();
                
                const base64Data = imageBuffer.toString('base64');
                
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "Extrae todo el texto del siguiente documento en español, incluyendo nombres, fechas, números y cualquier información relevante."
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Data}`
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 4000
                });
                
                return response.choices[0].message.content;
            } catch (imageError) {
                throw new Error(`Error al procesar la imagen: ${imageError.message}`);
            }
        }
    } catch (error) {
        console.error('Error en OCR:', error);
        if (error.response) {
            console.error('Error response:', error.response.data);
        }
        throw new Error('Error al procesar el documento con OCR: ' + error.message);
    }
}

// AI Processing
async function processWithAI(text) {
    try {
        const prompt = `Analiza el siguiente texto extraído de un acta constitutiva mexicana y extrae la siguiente información en formato estructurado:

1. Razón o denominación social
2. Nombres, nacionalidad y domicilio de los socios
3. Objeto social
4. Duración de la sociedad
5. Capital social
6. Aportes de cada socio
7. Forma de administración
8. Representante legal
9. Distribución de utilidades
10. Fondo de reserva
11. Comisarios
12. Casos de disolución
13. Bases para liquidación

Si alguna información no está presente en el texto, indícalo como "No especificado".

Texto a analizar:
${text}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 4000
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error en procesamiento AI:', error);
        throw new Error('Error al procesar el texto con AI: ' + error.message);
    }
}

// API Routes
app.post('/api/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se ha subido ningún archivo' });
        }

        const filePath = req.file.path;
        const fileType = req.file.mimetype;
        
        try {
            console.log('Procesando OCR...');
            const ocrText = await processOCR(filePath, fileType);
            
            if (!ocrText || ocrText.trim().length === 0) {
                throw new Error('No se pudo extraer texto del documento. Por favor, asegúrate de que el documento sea legible.');
            }

            console.log('Procesando con AI...');
            const extractedData = await processWithAI(ocrText);

            // Limpiar el archivo original - manejar errores de permisos
            try {
                fs.unlinkSync(filePath);
            } catch (unlinkError) {
                console.warn(`No se pudo eliminar el archivo original ${filePath}: ${unlinkError.message}`);
            }

            res.json({
                success: true,
                data: extractedData
            });
        } catch (error) {
            // Limpiar el archivo original en caso de error - manejar errores de permisos
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (unlinkError) {
                    console.warn(`No se pudo eliminar el archivo original ${filePath}: ${unlinkError.message}`);
                }
            }
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

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
}); 