const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const poppler = require('pdf-poppler');
const OpenAI = require('openai');
const os = require('os');
const popplerFix = require('./poppler-fix');

// Detectar si estamos en macOS
const isMacOS = os.platform() === 'darwin';
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
    console.log('[DEBUG] Iniciando convertPDFToImages para:', pdfPath);
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
        
        // Para otras plataformas, usar el módulo original
        const opts = {
            format: 'png', // Mejor calidad con PNG
            out_dir: 'uploads',
            out_prefix: path.basename(pdfPath, '.pdf'),
            page: null // Convertir todas las páginas
        };

        console.log('[DEBUG] Configuración de conversión:', JSON.stringify(opts));
        console.log('[DEBUG] Llamando a poppler.convert...');
        
        // Intentar ejecutar mediante child_process para capturar la salida
        try {
            const { execSync } = require('child_process');
            const popplerLibPath = path.join(__dirname, '../node_modules/pdf-poppler/lib/osx/poppler-0.66/bin/pdftocairo');
            
            console.log('[DEBUG] Verificando si existe el binario interno:', popplerLibPath);
            if (fs.existsSync(popplerLibPath)) {
                console.log('[DEBUG] El binario interno existe');
            } else {
                console.log('[DEBUG] ¡ALERTA! El binario interno NO existe');
            }
            
            // Intentar ejecutar el comando directamente para ver la salida
            try {
                console.log('[DEBUG] Intentando ejecutar comando directamente...');
                const outputPrefix = path.join('uploads', path.basename(pdfPath, '.pdf'));
                const cmd = `/opt/homebrew/bin/pdftocairo -png "${pdfPath}" "${outputPrefix}"`;
                console.log('[DEBUG] Comando:', cmd);
                const output = execSync(cmd, { encoding: 'utf8' });
                console.log('[DEBUG] Salida del comando:', output);
            } catch (execError) {
                console.error('[DEBUG] Error ejecutando comando directamente:', execError.message);
                if (execError.stderr) console.error('[DEBUG] Error stderr:', execError.stderr);
                if (execError.stdout) console.log('[DEBUG] Error stdout:', execError.stdout);
            }
        } catch (childProcessError) {
            console.error('[DEBUG] Error usando child_process:', childProcessError);
        }
        
        // Continuar con el método normal
        try {
        await poppler.convert(pdfPath, opts);
            console.log('[DEBUG] Conversión con poppler completada exitosamente');
        } catch (popplerError) {
            console.error('[DEBUG] Error en poppler.convert:', popplerError);
            throw popplerError;
        }
        
        // Obtener todas las imágenes generadas
        console.log('[DEBUG] Buscando imágenes generadas...');
        const pdfBaseName = path.basename(pdfPath, '.pdf');
        const files = fs.readdirSync('uploads');
        const matchingFiles = files
            .filter(file => 
                file.startsWith(pdfBaseName) && 
                file !== path.basename(pdfPath) && // Excluir el PDF original
                (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
            )
            .map(file => path.join('uploads', file));
            
        console.log('[DEBUG] Imágenes encontradas:', matchingFiles.length);
        console.log('[DEBUG] Listado de imágenes:', matchingFiles);
        
        return matchingFiles;
    } catch (error) {
        console.error('[DEBUG] Error detallado en convertPDFToImages:', error);
        console.error('[DEBUG] Stack trace:', error.stack);
        throw new Error('Error al convertir PDF a imágenes: ' + error.message);
    }
}

/**
 * Procesa un documento usando OCR para extraer texto de tablas y listas
 * Utiliza diferentes estrategias según el tipo de archivo (PDF o imagen)
 * y optimiza las imágenes antes de aplicar OCR con GPT-4o
 * Específicamente diseñado para extraer información de listas de personas bloqueadas
 * 
 * @param {string} filePath - Ruta del archivo a procesar
 * @param {string} fileType - Tipo MIME del archivo (application/pdf, image/jpeg, etc.)
 * @returns {Promise<{text: string, tempFiles: string[]}>} - Texto extraído y lista de archivos temporales creados
 * @throws {Error} - Error si el proceso de OCR falla
 */
async function processOCR(filePath, fileType) {
    console.log('[DEBUG] Iniciando processOCR con archivo:', filePath, 'tipo:', fileType);
    const tempFilesToDelete = [];
    try {
        if (fileType === 'application/pdf') {
            console.log('[DEBUG] Procesando documento PDF');
            // Intentar usar el binario de poppler instalado por Homebrew
            try {
                console.log('[DEBUG] Verificando si existe poppler instalado por Homebrew');
                // Verificar si existe el binario de Homebrew (para Apple Silicon o Intel)
                const homebrewPaths = [
                    '/opt/homebrew/bin/pdftocairo',  // Apple Silicon (M1/M2)
                    '/usr/local/bin/pdftocairo'      // Intel
                ];
                
                let popperBinaryFound = false;
                for (const brewPath of homebrewPaths) {
                    if (fs.existsSync(brewPath)) {
                        console.log(`[DEBUG] Encontrado binario poppler en: ${brewPath}`);
                        // Aquí podrías modificar el módulo poppler para usar esta ruta
                        // pero por ahora solo lo reportamos
                        popperBinaryFound = true;
                        break;
                    }
                }
                
                if (!popperBinaryFound) {
                    console.log('[DEBUG] No se encontró binario de poppler instalado con Homebrew. Se usará el incluido en node_modules');
                }
            } catch (brewCheckError) {
                console.error('[DEBUG] Error al verificar binario de Homebrew:', brewCheckError);
            }
            
            console.log('[DEBUG] Intentando convertir PDF a imágenes...');
            // Convertir PDF a imágenes
            const imagePaths = await convertPDFToImages(filePath);
            console.log('[DEBUG] Conversión de PDF exitosa, imágenes generadas:', imagePaths.length);
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
                                        text: "Extrae todas las tablas y listas de personas o entidades bloqueadas de este documento. Presta especial atención a:\n\n1. Nombres completos de personas o entidades\n2. Alias o nombres alternativos (a veces indicados como 'También conocido como' o similar)\n3. Fechas de nacimiento si aparecen\n4. Domicilios o direcciones\n5. Cualquier información adicional relevante\n\nTranscribe el texto de las tablas de manera completa, preservando la estructura tabular. Si NO HAY TABLAS o listas visibles, responde EXACTAMENTE con 'NO_TABLAS_VISIBLES'. No omitas ninguna información visible de las tablas."
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
                    
                    // Verificar si el modelo indicó que no hay tablas visibles
                    if (extractedText.trim() !== 'NO_TABLAS_VISIBLES') {
                        console.log(`Texto extraído de la página ${imagePath}: ${extractedText.length} caracteres`);
                        allText += extractedText + '\n\n';
                    } else {
                        console.warn(`No se encontraron tablas en la imagen ${imagePath}`);
                    }
                } catch (imageError) {
                    console.warn(`Error al procesar imagen ${imagePath}: ${imageError.message}`);
                    // Continuar con la siguiente imagen
                }
            }
            
            if (!allText.trim()) {
                throw new Error('No se pudo extraer información de tablas de ninguna de las páginas del PDF. Es posible que el documento no contenga listas de personas bloqueadas o que el formato no sea reconocible.');
            }
            
            return { text: allText, tempFiles: tempFilesToDelete };
        } else {
            console.log('[DEBUG] Procesando documento de imagen directamente');
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
                                    text: "Extrae todas las tablas y listas de personas o entidades bloqueadas de este documento. Presta especial atención a:\n\n1. Nombres completos de personas o entidades\n2. Alias o nombres alternativos (a veces indicados como 'También conocido como' o similar)\n3. Fechas de nacimiento si aparecen\n4. Domicilios o direcciones\n5. Cualquier información adicional relevante\n\nTranscribe el texto de las tablas de manera completa, preservando la estructura tabular. Si NO HAY TABLAS o listas visibles, responde EXACTAMENTE con 'NO_TABLAS_VISIBLES'. No omitas ninguna información visible de las tablas."
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
                
                // Verificar si el modelo indicó que no hay tablas visibles
                if (extractedText.trim() === 'NO_TABLAS_VISIBLES') {
                    throw new Error('No se pudieron encontrar tablas o listas de personas bloqueadas en el documento.');
                }
                
                return { text: extractedText, tempFiles: tempFilesToDelete };
            } catch (imageError) {
                throw new Error(`Error al procesar la imagen: ${imageError.message}`);
            }
        }
    } catch (error) {
        console.error('[DEBUG] Error en processOCR:', error);
        if (error.response) {
            console.error('[DEBUG] Error response:', error.response.data);
        }
        throw new Error('Error al procesar el documento con OCR: ' + error.message);
    }
}

/**
 * Procesa el texto extraído mediante IA para estructurar la información
 * Utiliza GPT-4o para analizar listas de personas bloqueadas y extraer datos
 * como nombres completos, alias, fechas de nacimiento y direcciones en formato JSON
 * 
 * @param {string} text - Texto extraído del documento mediante OCR
 * @returns {Promise<string>} - Cadena JSON con el array de personas/entidades bloqueadas
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
        
        const prompt = `Analiza el siguiente texto extraído de un documento con listas de personas bloqueadas y extrae la información en formato de array JSON. Para cada persona o entidad, extrae:

1. Nombre completo
2. Tipo (persona física o entidad)
3. Alias o nombres alternativos (como array si hay varios)
4. Fecha de nacimiento (si está disponible)
5. Domicilio o dirección (si está disponible)
6. Cualquier información adicional relevante

IMPORTANTE:
- Identifica correctamente cuando un texto es un alias o nombre alternativo. Estos suelen aparecer como "También conocido como", "alias", "a.k.a.", o similares, a menudo en un nivel de indentación diferente.
- Si no puedes determinar si una entrada es un alias o una persona diferente, trátala como una persona separada.
- Las entradas pueden estar en formato tabular o como lista con viñetas.

MUY IMPORTANTE: 
- Las llaves (keys) del JSON deben estar EN INGLÉS, siguiendo este formato exacto:
  - "fullName" (para nombre completo)
  - "type" (para tipo de entidad o persona)
  - "aliases" (para alias o nombres alternativos)
  - "birthDate" (para fecha de nacimiento)
  - "address" (para domicilio o dirección)
  - "additionalInfo" (para información adicional)
- Tu respuesta debe contener ÚNICAMENTE el array JSON válido sin ninguna explicación adicional, comentario o texto que no forme parte del JSON.
- No incluyas comillas triples (\`\`\`) ni explicaciones después del JSON.

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
        
        // Extraer solo el JSON válido (buscar desde el primer "[" hasta el último "]")
        const jsonStartIndex = content.indexOf('[');
        const jsonEndIndex = content.lastIndexOf(']') + 1;
        
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
                const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
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