const pdf = require('pdf-img-convert');
const fs = require('fs').promises;
const path = require('path');

/**
 * Converts a PDF file into multiple image files (one per page).
 * Uses the 'pdf-img-convert' library which relies on 'canvas'.
 *
 * @param {string} pdfPath - The full path to the input PDF file.
 * @param {string} outputDir - The directory where the output images will be saved.
 * @returns {Promise<string[]>} A promise that resolves with an array of paths to the generated image files.
 * @throws {Error} If the conversion process fails.
 */
async function convertPdfToImages(pdfPath, outputDir) {
    console.log(`[pdf_processor] Starting conversion for: ${pdfPath}`);
    console.log(`[pdf_processor] Output directory: ${outputDir}`);

    try {
        // Configuration for image conversion (e.g., scale, format)
        const conversion_config = {
            // width: 1024, // You can set width/height or scale
            // height: 1448,
            scale: 1.5, // Increase scale for better OCR quality, adjust as needed
            // page_numbers: [1] // Process only specific pages if needed
        };

        // Convert PDF to an array of image buffers
        const outputImages = await pdf.convert(pdfPath, conversion_config);
        console.log(`[pdf_processor] PDF converted to ${outputImages.length} image buffers.`);

        const imagePaths = [];

        // Save each image buffer to a file
        for (let i = 0; i < outputImages.length; i++) {
            const imageFileName = `page_${i + 1}.png`; // Use PNG format
            const imagePath = path.join(outputDir, imageFileName);

            try {
                await fs.writeFile(imagePath, outputImages[i]);
                imagePaths.push(imagePath);
                console.log(`[pdf_processor] Saved image: ${imagePath}`);
            } catch (writeError) {
                console.error(`[pdf_processor] Error writing image file ${imagePath}:`, writeError);
                // Decide if you want to stop or continue with other pages
                throw new Error(`Failed to write image file for page ${i + 1}.`);
            }
        }

        if (imagePaths.length === 0) {
            console.warn("[pdf_processor] No images were generated. The PDF might be empty or invalid.");
        }

        console.log(`[pdf_processor] Conversion successful. Generated images: ${imagePaths.join(', ')}`);
        return imagePaths; // Return the array of saved image paths

    } catch (error) {
        console.error('[pdf_processor] Error during PDF to image conversion:', error);
        // Provide a more specific error message if possible
        let errorMessage = 'Error al convertir PDF a imágenes.';
        if (error.message && error.message.includes('Invalid PDF structure')) {
            errorMessage = 'Error: Estructura de PDF inválida.';
        } else if (error.message) {
            errorMessage += ` Detalles: ${error.message}`;
        }
        throw new Error(errorMessage);
    }
}

module.exports = {
    convertPdfToImages
};
