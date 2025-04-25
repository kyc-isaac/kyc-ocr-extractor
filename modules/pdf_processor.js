const pdf = require("pdf-img-convert");
const fs = require("fs").promises;
const path = require("path");

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
    // Configuration for image conversion
    const conversion_config = {
      // --- Increased scale for potentially better OCR quality ---
      scale: 2.0, // Was 1.5, increased to 2.0. Adjust further (e.g., 2.5) if needed.
      // Using scale is generally preferred over fixed width/height unless you know the exact dimensions needed.
      // width: 1024,
      // height: 1448,
      // page_numbers: [1] // Optional: Process only specific pages for testing
    };

    // Convert PDF to an array of image buffers (PNG by default)
    console.log(
      `[pdf_processor] Converting with scale: ${conversion_config.scale}`
    );
    const outputImages = await pdf.convert(pdfPath, conversion_config);
    console.log(
      `[pdf_processor] PDF converted to ${outputImages.length} image buffers.`
    );

    const imagePaths = [];

    // Save each image buffer to a file
    for (let i = 0; i < outputImages.length; i++) {
      // Using PNG format as it's lossless and good for text clarity
      const imageFileName = `page_${i + 1}.png`;
      const imagePath = path.join(outputDir, imageFileName);

      try {
        await fs.writeFile(imagePath, outputImages[i]);
        imagePaths.push(imagePath);
        // Avoid logging excessively for large documents, maybe log every N pages or just start/end
        // console.log(`[pdf_processor] Saved image: ${imagePath}`);
      } catch (writeError) {
        console.error(
          `[pdf_processor] Error writing image file ${imagePath}:`,
          writeError
        );
        // Stop processing if a page fails to write? Or just log and continue?
        // For now, let's throw, as subsequent steps depend on the images.
        throw new Error(`Failed to write image file for page ${i + 1}.`);
      }
    }

    if (imagePaths.length === 0 && outputImages.length > 0) {
      console.error(
        "[pdf_processor] Images were generated but failed to save."
      );
      throw new Error("Error al guardar las imágenes generadas del PDF.");
    } else if (imagePaths.length === 0) {
      console.warn(
        "[pdf_processor] No images were generated or saved. The PDF might be empty, invalid, or protected."
      );
    }

    console.log(
      `[pdf_processor] Conversion successful. Generated ${imagePaths.length} images.`
    );
    return imagePaths; // Return the array of saved image paths
  } catch (error) {
    console.error(
      "[pdf_processor] Error during PDF to image conversion:",
      error
    );
    // Provide a more specific error message if possible
    let errorMessage = "Error al convertir PDF a imágenes.";
    if (
      error.message &&
      (error.message.includes("Invalid PDF structure") ||
        error.message.includes("Command failed"))
    ) {
      errorMessage =
        "Error: El PDF parece tener una estructura inválida o está dañado.";
    } else if (error.message) {
      errorMessage += ` Detalles: ${error.message}`;
    }
    // Add context about potential causes
    errorMessage +=
      " Asegúrate de que el archivo no esté protegido por contraseña y sea un PDF válido.";
    throw new Error(errorMessage);
  }
}

module.exports = {
  convertPdfToImages,
};
