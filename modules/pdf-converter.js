const fs = require('fs');
const path = require('path');
const PDF = require('sharp-pdf');
const sharp = require('sharp');

/**
 * Convierte un archivo PDF a imágenes individuales por página
 * @param {string} filePath Ruta al archivo PDF
 * @param {string} outputDir Directorio de salida para las imágenes
 * @returns {Promise<Array<string>>} Lista de rutas a las imágenes generadas
 */
async function convertPdfToImages(filePath, outputDir) {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const images = await PDF.sharpsFromPdf(filePath, {
      delay: 100, // Evitar bloquear la UI
      handler: (event, data) => {
        if (event === "loading") {
          console.log(`Cargando PDF: ${Math.round((data.loaded / data.total) * 100)}%`);
        } else if (event === "image") {
          console.log(`Procesando imagen ${data.pageIndex + 1}/${data.pages}`);
        }
      }
    });

    const outputPaths = [];
    
    // Procesar cada imagen extraída del PDF
    for (const { image, pageIndex, channels } of images) {
      const ext = channels > 3 ? '.png' : '.jpg';
      const outputFilePath = path.join(outputDir, `page-${pageIndex + 1}${ext}`);
      
      await image.toFile(outputFilePath);
      outputPaths.push(outputFilePath);
    }

    return outputPaths;
  } catch (error) {
    console.error('Error al convertir PDF a imágenes:', error);
    throw error;
  }
}

/**
 * Convierte imágenes a un archivo PDF
 * @param {Array<string>} imagePaths Lista de rutas a las imágenes
 * @param {string} outputPath Ruta del archivo PDF de salida
 * @returns {Promise<Object>} Información del archivo PDF generado
 */
async function convertImagesToPdf(imagePaths, outputPath) {
  try {
    const sharpImages = imagePaths.map(imagePath => sharp(imagePath));
    
    const result = await PDF.sharpsToPdf(sharpImages, outputPath, {
      imageOptions: {
        fit: true,
        handler: ({ index, pages }) => {
          console.log(`Procesando página ${index + 1}/${pages}`);
        }
      }
    });
    
    return result;
  } catch (error) {
    console.error('Error al convertir imágenes a PDF:', error);
    throw error;
  }
}

module.exports = {
  convertPdfToImages,
  convertImagesToPdf
}; 