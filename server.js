// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Use promise-based fs
const os = require('os'); // To get temporary directory
const pdfProcessor = require('./modules/pdf_processor');
const openaiProcessor = require('./modules/openai_processor');

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3000;
// Define base path, default to empty string if not set or empty in .env
const basePath = process.env.BASE_PATH || '';
const UPLOAD_DIR = path.join(__dirname, 'uploads'); // Define upload directory path

// --- Middleware ---
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// Serve static files (CSS, frontend JS) from the 'public' directory, considering the base path
app.use(basePath, express.static(path.join(__dirname, 'public')));

// --- Ensure Upload Directory Exists ---
// Asynchronous function to create directory if it doesn't exist
const ensureUploadDirExists = async () => {
    try {
        await fs.access(UPLOAD_DIR);
        console.log(`Upload directory already exists: ${UPLOAD_DIR}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Creating upload directory: ${UPLOAD_DIR}`);
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
        } else {
            console.error("Error checking/creating upload directory:", error);
            process.exit(1); // Exit if we can't create the upload dir
        }
    }
};

// --- Multer Configuration (File Uploads) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR); // Save files directly to the uploads directory
    },
    filename: (req, file, cb) => {
        // Generate a unique filename to avoid collisions
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Allow only PDF files for now, can be expanded later
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no soportado. Solo se permiten archivos PDF.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // Limit file size (e.g., 50MB)
});

// --- HTML Page Routes ---
// Serve the main selection page
app.get(`${basePath}/`, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Serve the Acta Constitutiva upload page
app.get(`${basePath}/acta-constitutiva`, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'acta-constitutiva.html'));
});

// Serve the Lista de Personas Bloqueadas upload page
app.get(`${basePath}/lista-bloqueados`, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'lista-bloqueados.html'));
});

// --- API Route for Processing Uploads ---
app.post(`${basePath}/api/upload`, upload.single('document'), async (req, res) => {
    let uploadedFilePath = null; // Keep track of the uploaded file path
    let tempImagePaths = []; // Keep track of generated images

    try {
        // Check if a file was uploaded
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se subió ningún archivo PDF.' });
        }
        uploadedFilePath = req.file.path; // Get the path of the uploaded file

        const documentType = req.body.documentType; // 'acta-constitutiva' or 'lista-bloqueados'
        if (!documentType) {
            return res.status(400).json({ success: false, error: 'No se especificó el tipo de documento.' });
        }

        console.log(`Processing ${documentType} from file: ${uploadedFilePath}`);

        // 1. Convert PDF to Images
        console.log("Converting PDF to images...");
        // Use a temporary directory within uploads for images
        const imageOutputDir = path.join(UPLOAD_DIR, `images_${Date.now()}`);
        await fs.mkdir(imageOutputDir);

        tempImagePaths = await pdfProcessor.convertPdfToImages(uploadedFilePath, imageOutputDir);
        console.log(`Generated ${tempImagePaths.length} images.`);

        if (tempImagePaths.length === 0) {
            throw new Error('No se pudieron generar imágenes a partir del PDF. El archivo podría estar vacío o corrupto.');
        }

        // 2. Process Images with OpenAI
        console.log("Extracting data from images using OpenAI...");
        let allExtractedData = [];
        let aggregatedText = ""; // Or structure based on needs

        // Process images sequentially for simplicity first.
        // Could be parallelized later with Promise.all or worker threads.
        for (const imagePath of tempImagePaths) {
            try {
                const base64Image = await fs.readFile(imagePath, { encoding: 'base64' });
                const extractedJson = await openaiProcessor.extractDataFromImage(base64Image, documentType);

                // Aggregate results (simple aggregation for now)
                // You might want to structure this better depending on the expected JSON output
                if (extractedJson) {
                    // If OpenAI returns structured data per page
                    if (typeof extractedJson === 'object') {
                       allExtractedData.push(extractedJson);
                    }
                    // If OpenAI returns text per page to be aggregated later
                    else if (typeof extractedJson === 'string') {
                       aggregatedText += extractedJson + "\n\n";
                    }
                }
                console.log(`Processed image: ${path.basename(imagePath)}`);
            } catch (imageProcessingError) {
                console.warn(`Warning processing image ${path.basename(imagePath)}: ${imageProcessingError.message}`);
                // Decide if you want to continue processing other images or stop
            }
        }

        console.log("Data extraction complete.");

        // Determine the final response data structure
        let responseData;
        if (allExtractedData.length > 0) {
            // If we collected structured data per page, decide how to combine it
            // Example: just return the array of page data
            responseData = allExtractedData;
            // Or potentially merge objects if they have a consistent structure
        } else if (aggregatedText) {
            // If we aggregated text, maybe run one final AI call to structure it
            // For now, just return the aggregated text or a placeholder
            // responseData = { combinedText: aggregatedText };
             // Let's try structuring the aggregated text if needed
             console.log("Structuring aggregated text with AI...");
             responseData = await openaiProcessor.structureAggregatedText(aggregatedText, documentType);

        } else {
            throw new Error('No se pudo extraer información de ninguna imagen.');
        }


        // 3. Send Response
        res.json({ success: true, data: responseData });

    } catch (error) {
        console.error('Error during file processing:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error interno del servidor al procesar el documento.'
        });
    } finally {
        // 4. Cleanup Temporary Files (Uploaded PDF and generated images)
        console.log("Cleaning up temporary files...");
        if (uploadedFilePath) {
            try {
                await fs.unlink(uploadedFilePath);
                console.log(`Deleted uploaded file: ${uploadedFilePath}`);
            } catch (cleanupError) {
                console.warn(`Could not delete uploaded file ${uploadedFilePath}: ${cleanupError.message}`);
            }
        }
        if (tempImagePaths.length > 0) {
            const imageDir = path.dirname(tempImagePaths[0]); // Get the directory path
             try {
                await fs.rm(imageDir, { recursive: true, force: true }); // Remove the directory and its contents
                console.log(`Deleted image directory: ${imageDir}`);
            } catch (cleanupError) {
                 console.warn(`Could not delete image directory ${imageDir}: ${cleanupError.message}`);
                 // Fallback: try deleting individual files if directory removal fails
                 for (const imgPath of tempImagePaths) {
                     try {
                         await fs.unlink(imgPath);
                     } catch (fileDeleteError) {
                         console.warn(`Could not delete image file ${imgPath}: ${fileDeleteError.message}`);
                     }
                 }
            }
        }
        console.log("Cleanup finished.");
    }
});

// --- Start Server ---
// Ensure upload directory exists before starting the server
ensureUploadDirExists().then(() => {
    app.listen(port, () => {
        // Construct the base URL carefully
        const serverUrl = `http://localhost:${port}${basePath}`;
        console.log(`Servidor corriendo en ${serverUrl}`);
        console.log(`Upload directory: ${UPLOAD_DIR}`);
        if (!process.env.OPENAI_API_KEY) {
            console.warn("WARN: OPENAI_API_KEY no está configurada en el archivo .env. Las llamadas a OpenAI fallarán.");
        }
    });
}).catch(error => {
    console.error("Failed to start server:", error);
    process.exit(1);
});
