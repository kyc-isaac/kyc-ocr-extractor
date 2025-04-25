const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const poppler = require('pdf-poppler');
const OpenAI = require('openai');
const os = require('os');
const popplerFix = require('./poppler-fix');

// Detectar si estamos en macOS
const isMacOS = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';
console.log(`[INFO] Sistema operativo: ${os.platform()}, Usando fix de poppler: ${isMacOS}`);

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Convierte un archivo PDF a imágenes PNG
 * Esta función transforma cada página del PDF en una imagen individual 
 * para facilitar el procesamiento OCR posterior
 * 
 * @param {string} pdfPath - Ruta completa al archivo PDF que se convertirá
 * @returns {Promise<string[]>} - Array con las rutas de las imágenes generadas
 * @throws {Error} - Error si la conversión falla
 */
async function convertPDFToImages(pdfPath) {
    try {
        // Si estamos en macOS, usar nuestra solución alternativa
        if (isMacOS) {
            console.log('[DEBUG] Usando popplerFix para macOS');
            // Verificar instalación primero
            const popplerInfo = popplerFix.checkPopplerInstallation();
            if (popplerInfo.error) {
                throw new Error(`Problema con poppler: ${popplerInfo.error}. Por favor instala poppler con: brew install poppler`);
            }
            
            // Usar las mismas opciones que el módulo original
            const opts = {
                format: 'png',
                out_dir: 'uploads',
                out_prefix: path.basename(pdfPath, '.pdf'),
                page: null,
                scale: 2.0 // Mejor calidad
            };
            
            return await popplerFix.convertPDFToImages(pdfPath, opts);
        }
        
        // Para Linux y otras plataformas, usar el módulo original
        console.log('[DEBUG] Usando pdf-poppler estándar para', os.platform());
        const opts = {
            format: 'png', // Mejor calidad con PNG
            out_dir: 'uploads',
            out_prefix: path.basename(pdfPath, '.pdf'),
            page: null // Convertir todas las páginas
        };

        await poppler.convert(pdfPath, opts);
        
        // Obtener todas las imágenes generadas
        const pdfBaseName = path.basename(pdfPath, '.pdf');
        const files = fs.readdirSync('uploads');
        return files
            .filter(file => 
                file.startsWith(pdfBaseName) && 
                file !== path.basename(pdfPath) && // Excluir el PDF original
                (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
            )
            .map(file => path.join('uploads', file));
    } catch (error) {
        console.error('Error al convertir PDF a imágenes:', error);
        throw new Error('Error al convertir PDF a imágenes: ' + error.message);
    }
}

/**
 * Procesa un documento usando OCR para extraer texto
 * Utiliza diferentes estrategias según el tipo de archivo (PDF o imagen)
 * y optimiza las imágenes antes de aplicar OCR con GPT-4o
 * 
 * @param {string} filePath - Ruta del archivo a procesar
 * @param {string} fileType - Tipo MIME del archivo (application/pdf, image/jpeg, etc.)
 * @returns {Promise<{text: string, tempFiles: string[]}>} - Texto extraído y lista de archivos temporales creados
 * @throws {Error} - Error si el proceso de OCR falla
 */
async function processOCR(filePath, fileType) {
    const tempFilesToDelete = [];
    try {
        if (fileType === 'application/pdf') {
            // Convertir PDF a imágenes
            const imagePaths = await convertPDFToImages(filePath);
            tempFilesToDelete.push(...imagePaths);
            let allText = '';
            
            for (const imagePath of imagePaths) {
                try {
                    console.log(`Procesando imagen: ${imagePath}`);
                    
                    // Probar distintos métodos de procesamiento de imágenes
                    let imageBuffer;
                    try {
                        // Primer intento con procesamiento completo
                        imageBuffer = await sharp(imagePath)
                            .resize(2000, 2000, {
                                fit: 'inside',
                                withoutEnlargement: true
                            })
                            .sharpen()
                            .normalize()
                            .jpeg({ quality: 90 })
                            .toBuffer();
                    } catch (sharpError) {
                        console.warn(`Error en procesamiento de imagen: ${sharpError.message}`);
                        
                        // Segundo intento: convertir a JPEG sin procesamiento adicional
                        const rawImageBuffer = fs.readFileSync(imagePath);
                        imageBuffer = await sharp(rawImageBuffer)
                            .jpeg()
                            .toBuffer();
                    }
                    
                    const base64Data = imageBuffer.toString('base64');
                    
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Extrae todo el texto visible de este documento (acta constitutiva mexicana). Presta especial atención a elementos como:\n\n1. RAZÓN O DENOMINACIÓN SOCIAL (normalmente aparece como nombre de la empresa o sociedad)\n2. Nombres completos de los socios\n3. Objeto social de la empresa\n4. Capital social\n5. Representante legal\n\nTranscribe el texto de manera completa, preservando párrafos y estructura. Si NO HAY TEXTO VISIBLE o la imagen está en blanco, responde EXACTAMENTE con 'NO_TEXTO_VISIBLE'. No omitas ninguna información visible como fechas, cantidades, direcciones o nombres propios. Este es un documento legal importante."
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
                    
                    const extractedText = response.choices[0].message.content;
                    
                    // Verificar si el modelo indicó que no hay texto visible
                    if (extractedText.trim() !== 'NO_TEXTO_VISIBLE') {
                        console.log(`Texto extraído de la página ${imagePath}: ${extractedText.length} caracteres`);
                        allText += extractedText + '\n\n';
                    } else {
                        console.warn(`No se encontró texto visible en la imagen ${imagePath}`);
                    }
                } catch (imageError) {
                    console.warn(`Error al procesar imagen ${imagePath}: ${imageError.message}`);
                    // Continuar con la siguiente imagen
                }
            }
            
            if (!allText.trim()) {
                throw new Error('No se pudo extraer texto de ninguna de las páginas del PDF. Es posible que el documento esté protegido, dañado o contenga solo imágenes sin texto reconocible.');
            }
            
            return { text: allText, tempFiles: tempFilesToDelete };
        } else {
            // Procesar imagen directamente
            const fileBuffer = fs.readFileSync(filePath);
            try {
                let imageBuffer;
                try {
                    // Primer intento con procesamiento completo
                    imageBuffer = await sharp(fileBuffer)
                        .resize(2000, 2000, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .sharpen()
                        .normalize()
                        .jpeg({ quality: 90 })
                        .toBuffer();
                } catch (sharpError) {
                    console.warn(`Error en procesamiento de imagen: ${sharpError.message}`);
                    
                    // Segundo intento: convertir a JPEG sin procesamiento adicional
                    imageBuffer = await sharp(fileBuffer)
                        .jpeg()
                        .toBuffer();
                }
                
                const base64Data = imageBuffer.toString('base64');
                
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "Extrae todo el texto visible de este documento (acta constitutiva mexicana). Presta especial atención a elementos como:\n\n1. RAZÓN O DENOMINACIÓN SOCIAL (normalmente aparece como nombre de la empresa o sociedad)\n2. Nombres completos de los socios\n3. Objeto social de la empresa\n4. Capital social\n5. Representante legal\n\nTranscribe el texto de manera completa, preservando párrafos y estructura. Si NO HAY TEXTO VISIBLE o la imagen está en blanco, responde EXACTAMENTE con 'NO_TEXTO_VISIBLE'. No omitas ninguna información visible como fechas, cantidades, direcciones o nombres propios. Este es un documento legal importante."
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
                
                const extractedText = response.choices[0].message.content;
                
                // Verificar si el modelo indicó que no hay texto visible
                if (extractedText.trim() === 'NO_TEXTO_VISIBLE') {
                    throw new Error('No se pudo extraer texto del documento. El documento parece no contener texto legible.');
                }
                
                return { text: extractedText, tempFiles: tempFilesToDelete };
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

/**
 * Procesa el texto extraído mediante IA para estructurar la información
 * Utiliza GPT-4o para analizar el texto del acta constitutiva y extraer datos
 * clave como razón social, socios, objeto social, etc. en formato JSON
 * 
 * @param {string} text - Texto extraído del documento mediante OCR
 * @returns {Promise<string>} - Cadena JSON con la información estructurada
 * @throws {Error} - Error si el procesamiento con IA falla
 */
async function processWithAI(text) {
    try {
        // Validar que haya suficiente texto para procesar
        if (text.length < 50) {
            return JSON.stringify({
                error: 'Insufficient text',
                message: `No se pudo extraer suficiente texto del documento para analizarlo. El texto extraído es: "${text}"`
            });
        }
        
        const prompt = `Analiza el siguiente texto extraído de un acta constitutiva mexicana y extrae la siguiente información en formato JSON:

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

IMPORTANTE: Si encuentras la razón social o denominación de la empresa en el texto, asegúrate de incluirla aunque esté parcialmente visible. Busca términos como "S.A. de C.V.", "S. de R.L.", nombres de empresas, o cualquier texto que parezca ser el nombre de una sociedad mercantil.

Si alguna información no está presente en el texto, indícalo como "Not specified".

MUY IMPORTANTE: 
- Tu respuesta debe ser un objeto JSON válido sin explicaciones adicionales, sin formato markdown y sin comillas triples (\`\`\`). SOLO devuelve el JSON puro.
- No incluyas texto ni explicaciones antes o después del JSON.
- Las llaves (keys) del JSON deben estar EN INGLÉS, siguiendo este formato exacto:
  - "companyName" (para razón o denominación social)
  - "partners" (para socios, puede ser un array con objetos que contengan name, nationality, address)
  - "businessPurpose" (para objeto social)
  - "duration" (para duración de la sociedad)
  - "capital" (para capital social)
  - "contributions" (para aportes de cada socio)
  - "managementForm" (para forma de administración)
  - "legalRepresentative" (para representante legal)
  - "profitDistribution" (para distribución de utilidades)
  - "reserveFund" (para fondo de reserva)
  - "commissioners" (para comisarios)
  - "dissolutionCases" (para casos de disolución)
  - "liquidationBasis" (para bases para liquidación)

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

        let content = response.choices[0].message.content.trim();
        
        // Eliminar cualquier formato markdown
        content = content.replace(/```json\s*/g, '');  // Eliminar ```json
        content = content.replace(/```\s*$/g, '');     // Eliminar ``` al final
        content = content.replace(/^```/g, '');        // Eliminar ``` al inicio
        
        // Extraer solo el JSON válido (buscar desde el primer "{" hasta el último "}")
        const jsonStartIndex = content.indexOf('{');
        const jsonEndIndex = content.lastIndexOf('}') + 1;
        
        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
            content = content.substring(jsonStartIndex, jsonEndIndex);
        }

        // Verificar que el resultado es un JSON válido
        try {
            JSON.parse(content);
            return content;
        } catch (jsonError) {
            console.error('Error al parsear JSON:', jsonError);
            console.log('Contenido que causó el error:', content);
            
            // Intentar limpiar más agresivamente y volver a intentar
            try {
                // Buscar patrones comunes de JSON y extraer solo la parte que parece JSON válido
                const match = content.match(/\{\s*"[\s\S]*"\s*:\s*[\s\S]*\}/);
                if (match) {
                    const extractedJson = match[0];
                    JSON.parse(extractedJson); // Verificar que sea válido
                    return extractedJson;
                }
            } catch (error) {
                // Si el segundo intento también falla, devolver el error original
            }
            
            // Si no es un JSON válido, devolver un JSON de error
            return JSON.stringify({
                error: 'Invalid format',
                message: 'No se pudo generar un JSON válido a partir del texto extraído.',
                extractedText: content
            });
        }
    } catch (error) {
        console.error('Error en procesamiento AI:', error);
        throw new Error('Error al procesar el texto con AI: ' + error.message);
    }
}

/**
 * Elimina los archivos temporales generados durante el procesamiento
 * Intenta eliminar inmediatamente y, si falla, programa un segundo intento
 * 
 * @param {string[]} filePaths - Array con las rutas de los archivos a eliminar
 */
function cleanupTempFiles(filePaths) {
    if (!filePaths || !filePaths.length) return;
    
    console.log(`Limpiando ${filePaths.length} archivos temporales...`);
    for (const filePath of filePaths) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.warn(`No se pudo eliminar el archivo temporal ${filePath}: ${error.message}`);
            // Programar eliminación posterior
            setTimeout(() => {
                try {
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) {
                    console.warn(`No se pudo eliminar el archivo temporal ${filePath} en el segundo intento`);
                }
            }, 10000); // Intentar de nuevo después de 10 segundos
        }
    }
}

module.exports = {
    processOCR,
    processWithAI,
    cleanupTempFiles
}; 