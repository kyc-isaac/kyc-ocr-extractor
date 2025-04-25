// Load environment variables from .env file
require("dotenv").config();

// Import necessary modules
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises; // Use promise-based fs
const pdfProcessor = require("./modules/pdf_processor");
const openaiProcessor = require("./modules/openai_processor"); // Use updated processor

// --- Configuration ---
const app = express();
const port = process.env.PORT || 3042;
// Configuración de ruta base para entornos de producción
const basePath = "/kyc-ocr-extractor"; // La ruta base tal como llega del proxy
const UPLOAD_DIR = path.join(__dirname, "uploads");

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración para servir archivos estáticos con MIME types correctos
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.css') {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.extname(filePath) === '.js') {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// Rutas específicas para archivos JavaScript y CSS
app.get(`${basePath}/js/upload.js`, (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public/js/upload.js'));
});

app.get(`${basePath}/css/style.css`, (req, res) => {
  res.setHeader('Content-Type', 'text/css');
  res.sendFile(path.join(__dirname, 'public/css/style.css'));
});

// Configuración de depuración para ver las rutas
app.use((req, res, next) => {
  console.log(`[DEBUG] Request path: ${req.path}`);
  next();
});

// --- Ensure Upload Directory Exists ---
const ensureUploadDirExists = async () => {
  try {
    await fs.access(UPLOAD_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    } else {
      console.error("Error checking/creating upload directory:", error);
      process.exit(1);
    }
  }
};

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else
    cb(
      new Error("Tipo de archivo no soportado. Solo se permiten archivos PDF."),
      false
    );
};
const upload = multer({ 
    storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- HTML Page Routes ---
// Maneja tanto la ruta base como la raíz
app.get([`${basePath}`, `${basePath}/`], (req, res) =>
  res.sendFile(path.join(__dirname, "views", "index.html"))
);
app.get(`${basePath}/acta-constitutiva`, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "acta-constitutiva.html"))
);
app.get(`${basePath}/lista-bloqueados`, (req, res) =>
  res.sendFile(path.join(__dirname, "views", "lista-bloqueados.html"))
);

// También mantener las rutas sin prefijo para entornos de desarrollo
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "views", "index.html"))
);
app.get("/acta-constitutiva", (req, res) =>
  res.sendFile(path.join(__dirname, "views", "acta-constitutiva.html"))
);
app.get("/lista-bloqueados", (req, res) =>
  res.sendFile(path.join(__dirname, "views", "lista-bloqueados.html"))
);

// Ruta de diagnóstico - responderá a cualquier ruta no manejada
app.get('*', (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>Diagnóstico KYC-OCR-Extractor</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>Diagnóstico de KYC-OCR-Extractor</h1>
        <p>Esta página de diagnóstico muestra información sobre la solicitud recibida:</p>
        <pre>
Ruta solicitada: ${req.path}
Método: ${req.method}
Headers: ${JSON.stringify(req.headers, null, 2)}
Query params: ${JSON.stringify(req.query, null, 2)}
        </pre>
        <p>Rutas disponibles:</p>
        <ul>
          <li><a href="${basePath}/">Página principal</a></li>
          <li><a href="${basePath}/acta-constitutiva">Acta Constitutiva</a></li>
          <li><a href="${basePath}/lista-bloqueados">Lista Bloqueados</a></li>
        </ul>
        <p>Nota: También puedes acceder directamente a estas URLs:</p>
        <ul>
          <li><a href="/kyc-ocr-extractor">Página principal</a></li>
          <li><a href="/kyc-ocr-extractor/acta-constitutiva">Acta Constitutiva</a></li>
          <li><a href="/kyc-ocr-extractor/lista-bloqueados">Lista Bloqueados</a></li>
        </ul>
      </body>
    </html>
  `);
});

// --- Helper Function to Normalize Names ---
function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .normalize("NFD") // Decompose combined characters (like accented letters)
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks (accents)
    .toUpperCase() // Convert to uppercase
    .replace(/[^A-Z0-9\s]/g, "") // Remove non-alphanumeric characters (except spaces)
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .trim(); // Remove leading/trailing spaces
}

// --- Helper Function to Merge Page Data (Acta Constitutiva) - REFINED ---
function mergeActaConstitutivaData(pageResults) {
  const finalData = {
    companyName: null,
    companyRfc: null,
    incorporationDate: null,
    partners: [],
    businessPurpose: "",
    capital: null,
    duration: null,
    managementBody: "",
    legalRepresentatives: [],
    notaryInfo: null,
    registrationData: "",
  };
  // Use multiple maps for better matching
  const partnerMapByName = new Map();
  const partnerMapByRfc = new Map();
  const partnerMapByCurp = new Map();
  let partnerCounter = 0; // To generate unique IDs if needed

  for (const pageData of pageResults) {
    if (!pageData) continue;

    // --- Merge Simple Fields (First non-null wins) ---
    if (!finalData.companyName && pageData.companyName)
      finalData.companyName = pageData.companyName;
    if (!finalData.companyRfc && pageData.companyRfc)
      finalData.companyRfc = pageData.companyRfc;
    if (!finalData.incorporationDate && pageData.incorporationDate)
      finalData.incorporationDate = pageData.incorporationDate;
    if (!finalData.capital && pageData.capital)
      finalData.capital = pageData.capital;
    if (!finalData.duration && pageData.duration)
      finalData.duration = pageData.duration;
    if (!finalData.notaryInfo && pageData.notaryInfo)
      finalData.notaryInfo = pageData.notaryInfo;

    // --- Append Text Chunks ---
    if (pageData.businessPurposeChunk)
      finalData.businessPurpose += pageData.businessPurposeChunk + "\n";
    if (pageData.managementBodyChunk)
      finalData.managementBody += pageData.managementBodyChunk + "\n";
    if (pageData.registrationDataChunk)
      finalData.registrationData += pageData.registrationDataChunk + "\n";

    // --- Aggregate Legal Representatives (Unique names) ---
    if (
      pageData.legalRepresentativesChunk &&
      Array.isArray(pageData.legalRepresentativesChunk)
    ) {
      pageData.legalRepresentativesChunk.forEach((rep) => {
        if (typeof rep === "string" && rep.trim()) {
          const trimmedRep = rep.trim();
          if (!finalData.legalRepresentatives.includes(trimmedRep)) {
            finalData.legalRepresentatives.push(trimmedRep);
          }
        }
      });
    }

    // --- Aggregate Partners (Refined Logic) ---
    if (pageData.partners && Array.isArray(pageData.partners)) {
      pageData.partners.forEach((pagePartner) => {
        if (
          !pagePartner ||
          (!pagePartner.name && !pagePartner.rfc && !pagePartner.curp)
        )
          return; // Skip if no identifying info

        const currentPartnerData = {
          // Cleaned data from this page
          name: pagePartner.name?.trim() || null,
          rfc: pagePartner.rfc?.trim().toUpperCase() || null,
          curp: pagePartner.curp?.trim().toUpperCase() || null,
          nationality: pagePartner.nationality || null,
          address: pagePartner.address || null,
          contribution: pagePartner.contribution || null,
        };
        const normalizedName = normalizeName(currentPartnerData.name);

        let existingPartner = null;
        let existingPartnerId = null;

        // 1. Try to find by RFC
        if (
          currentPartnerData.rfc &&
          partnerMapByRfc.has(currentPartnerData.rfc)
        ) {
          existingPartnerId = partnerMapByRfc.get(currentPartnerData.rfc);
          existingPartner = partnerMapByName.get(existingPartnerId); // Get partner by its ID stored in name map
        }
        // 2. Try to find by CURP
        else if (
          currentPartnerData.curp &&
          partnerMapByCurp.has(currentPartnerData.curp)
        ) {
          existingPartnerId = partnerMapByCurp.get(currentPartnerData.curp);
          existingPartner = partnerMapByName.get(existingPartnerId);
        }
        // 3. Try to find by Normalized Name
        else if (normalizedName && partnerMapByName.has(normalizedName)) {
          existingPartner = partnerMapByName.get(normalizedName);
          existingPartnerId = normalizedName; // Use name as ID if found by name
        }

        if (existingPartner) {
          // --- Merge with existing partner ---
          // console.log(`[Merge] Found existing partner for: ${currentPartnerData.name || currentPartnerData.rfc || currentPartnerData.curp}`);
          for (const key in currentPartnerData) {
            if (
              currentPartnerData[key] != null &&
              existingPartner[key] == null
            ) {
              existingPartner[key] = currentPartnerData[key]; // Fill missing info
            }
            // Special case: Update name if the new one is longer/more complete? (Optional)
            if (
              key === "name" &&
              currentPartnerData.name &&
              (!existingPartner.name ||
                currentPartnerData.name.length > existingPartner.name.length)
            ) {
              existingPartner.name = currentPartnerData.name;
            }
            // Update maps if RFC/CURP were just added
            if (
              key === "rfc" &&
              currentPartnerData.rfc &&
              !partnerMapByRfc.has(currentPartnerData.rfc)
            ) {
              partnerMapByRfc.set(currentPartnerData.rfc, existingPartnerId);
            }
            if (
              key === "curp" &&
              currentPartnerData.curp &&
              !partnerMapByCurp.has(currentPartnerData.curp)
            ) {
              partnerMapByCurp.set(currentPartnerData.curp, existingPartnerId);
            }
          }
        } else {
          // --- Add as new partner ---
          // console.log(`[Merge] Adding new partner: ${currentPartnerData.name || currentPartnerData.rfc || currentPartnerData.curp}`);
          const newPartnerId = normalizedName || `partner_${partnerCounter++}`; // Use normalized name or generate ID
          const newPartner = {
            id: newPartnerId, // Internal ID for mapping
            name: currentPartnerData.name,
            rfc: currentPartnerData.rfc,
            curp: currentPartnerData.curp,
            nationality: currentPartnerData.nationality,
            address: currentPartnerData.address,
            contribution: currentPartnerData.contribution,
          };
          partnerMapByName.set(newPartnerId, newPartner); // Store by ID/Name
          if (newPartner.rfc) partnerMapByRfc.set(newPartner.rfc, newPartnerId);
          if (newPartner.curp)
            partnerMapByCurp.set(newPartner.curp, newPartnerId);
        }
      });
    }
  }

  // Convert partner map (values) back to array, removing the internal ID
  finalData.partners = Array.from(partnerMapByName.values()).map(
    ({ id, ...rest }) => rest
  );

  // Trim appended strings and set to null if empty
  finalData.businessPurpose = finalData.businessPurpose.trim() || null;
  finalData.managementBody = finalData.managementBody.trim() || null;
  finalData.registrationData = finalData.registrationData.trim() || null;

  return finalData;
}

// --- Helper Function to Merge Page Data (Lista Bloqueados) ---
// (Same as previous version, assuming extractDataFromPage returns object with 'entries' array)
function mergeListaBloqueadosData(pageResults) {
  const finalData = [];
  const entryMap = new Map(); // Use RFC/CURP/Name as key for uniqueness

  for (const pageResult of pageResults) {
    if (!pageResult || !Array.isArray(pageResult.entries)) continue;

    pageResult.entries.forEach((entry) => {
      if (!entry || !entry.fullName) return;
      const entryKey = (entry.rfc || entry.curp || entry.fullName)
        .toUpperCase()
        .trim();

      if (!entryMap.has(entryKey)) {
        const newEntry = {
          fullName: entry.fullName || null,
          type: entry.type || null,
          aliases: Array.isArray(entry.aliases) ? entry.aliases : [],
          rfc: entry.rfc || null,
          curp: entry.curp || null,
          birthDate: entry.birthDate || null,
          address: entry.address || null,
          reason: entry.reason || null,
          sourceList: entry.sourceList || null,
        };
        entryMap.set(entryKey, newEntry);
      } else {
        const existingEntry = entryMap.get(entryKey);
        if (Array.isArray(entry.aliases)) {
          entry.aliases.forEach((alias) => {
            if (alias && !existingEntry.aliases.includes(alias)) {
              existingEntry.aliases.push(alias);
            }
          });
        }
        for (const key in entry) {
          if (
            existingEntry.hasOwnProperty(key) &&
            entry[key] != null &&
            existingEntry[key] == null
          ) {
            existingEntry[key] = entry[key];
          }
        }
      }
    });
  }
  return Array.from(entryMap.values());
}

// --- API Route for Processing Uploads ---
// Ruta con el prefijo para producción
app.post(
  `${basePath}/api/upload`,
  upload.single("document"),
  async (req, res) => {
    let uploadedFilePath = null;
    let tempImagePaths = [];
    let imageOutputDir = null;

    try {
      // --- Input Validation ---
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No se subió ningún archivo PDF." });
      }
      uploadedFilePath = req.file.path;
      const documentType = req.body.documentType;
      if (
        !documentType ||
        (documentType !== "acta-constitutiva" &&
          documentType !== "lista-bloqueados")
      ) {
        if (uploadedFilePath)
          await fs
            .unlink(uploadedFilePath)
            .catch((err) => console.warn(`Cleanup error: ${err.message}`));
        return res
          .status(400)
          .json({
            success: false,
            error: "Tipo de documento inválido o no especificado.",
          });
      }
      console.log(
        `[Server] Processing ${documentType} from file: ${uploadedFilePath}`
      );

      // --- Step 1: Convert PDF to Images ---
      console.log("[Server] Step 1: Converting PDF to images...");
      imageOutputDir = path.join(
        UPLOAD_DIR,
        `images_${path.basename(uploadedFilePath, ".pdf")}_${Date.now()}`
      );
      await fs.mkdir(imageOutputDir);
      tempImagePaths = await pdfProcessor.convertPdfToImages(
        uploadedFilePath,
        imageOutputDir
      );
      console.log(`[Server] Generated ${tempImagePaths.length} images.`);
      if (tempImagePaths.length === 0) {
        throw new Error("No se pudieron generar imágenes a partir del PDF.");
      }

      // --- Step 2: Extract STRUCTURED Data from Each Image ---
      console.log(
        "[Server] Step 2: Extracting structured data per page using OpenAI..."
      );
      let pageCount = 0;
      const totalPages = tempImagePaths.length;
      const extractionPromises = [];

      for (const imagePath of tempImagePaths) {
        extractionPromises.push(
          (async (imgPath, pageNum) => {
            try {
              const base64Image = await fs.readFile(imgPath, {
                encoding: "base64",
              });
              const pageJsonData = await openaiProcessor.extractDataFromPage(
                base64Image,
                pageNum,
                documentType
              );
              return pageJsonData;
            } catch (imageProcessingError) {
              console.warn(
                `[Server] Warning processing page ${pageNum}: ${imageProcessingError.message}`
              );
              return null;
            }
          })(imagePath, ++pageCount)
        );
      }

      const pageResults = await Promise.all(extractionPromises);
      console.log(
        `[Server] Data extraction complete. Received results for ${
          pageResults.filter((r) => r !== null).length
        } out of ${totalPages} pages.`
      );

      const validPageResults = pageResults.filter((result) => result !== null);
      if (validPageResults.length === 0) {
        throw new Error(
          "No se pudo extraer información estructurada de ninguna página del documento."
        );
      }

      // --- Step 3: Merge Page Data ---
      console.log("[Server] Step 3: Merging data from all pages...");
      let finalJsonData;
      if (documentType === "acta-constitutiva") {
        finalJsonData = mergeActaConstitutivaData(validPageResults); // Use the refined merge function
      } else if (documentType === "lista-bloqueados") {
        finalJsonData = mergeListaBloqueadosData(validPageResults);
      } else {
        throw new Error(
          "Tipo de documento desconocido durante la fusión de datos."
        );
      }
      console.log("[Server] Merging complete.");
      // console.log("[Server] Final Merged JSON:", JSON.stringify(finalJsonData, null, 2)); // Uncomment for debugging

      // --- Step 4: Send Successful Response ---
      res.json({ success: true, data: finalJsonData });
    } catch (error) {
      // --- Error Handling ---
      console.error("[Server] Error during file processing pipeline:", error);
      const statusCode =
        error.message.includes("PDF") ||
        error.message.includes("Tipo de documento") ||
        error.status === 400
          ? 400
          : error.status === 429
          ? 429
          : 500;
      const clientErrorMessage =
        statusCode === 400 ||
        statusCode === 429 ||
        error.message.startsWith("La respuesta") ||
        error.message.startsWith("Error en la API") ||
        error.message.startsWith("No se pudo extraer")
          ? error.message
          : "Ocurrió un error inesperado en el servidor al procesar el documento.";

      res
        .status(statusCode)
        .json({ success: false, error: clientErrorMessage });
    } finally {
      // --- Step 5: Cleanup Temporary Files ---
      console.log("[Server] Step 5: Cleaning up temporary files...");
      if (uploadedFilePath) {
        await fs
          .unlink(uploadedFilePath)
          .catch((err) =>
            console.warn(`[Cleanup Warn] Failed to delete PDF: ${err.message}`)
          );
      }
      if (imageOutputDir) {
        await fs
          .rm(imageOutputDir, { recursive: true, force: true })
          .catch((err) =>
            console.warn(
              `[Cleanup Warn] Failed to delete image directory: ${err.message}`
            )
          );
      }
      console.log("[Server] Cleanup finished.");
    }
  }
);

// Duplicar la ruta API sin prefijo para desarrollo
app.post(
  `/api/upload`,
  upload.single("document"),
  async (req, res) => {
    let uploadedFilePath = null;
    let tempImagePaths = [];
    let imageOutputDir = null;

    try {
      // --- Input Validation ---
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No se subió ningún archivo PDF." });
      }
      uploadedFilePath = req.file.path;
      const documentType = req.body.documentType;
      if (
        !documentType ||
        (documentType !== "acta-constitutiva" &&
          documentType !== "lista-bloqueados")
      ) {
        if (uploadedFilePath)
          await fs
            .unlink(uploadedFilePath)
            .catch((err) => console.warn(`Cleanup error: ${err.message}`));
        return res
          .status(400)
          .json({
            success: false,
            error: "Tipo de documento inválido o no especificado.",
          });
      }
      console.log(
        `[Server] Processing ${documentType} from file: ${uploadedFilePath}`
      );

      // --- Step 1: Convert PDF to Images ---
      console.log("[Server] Step 1: Converting PDF to images...");
      imageOutputDir = path.join(
        UPLOAD_DIR,
        `images_${path.basename(uploadedFilePath, ".pdf")}_${Date.now()}`
      );
      await fs.mkdir(imageOutputDir);
      tempImagePaths = await pdfProcessor.convertPdfToImages(
        uploadedFilePath,
        imageOutputDir
      );
      console.log(`[Server] Generated ${tempImagePaths.length} images.`);
      if (tempImagePaths.length === 0) {
        throw new Error("No se pudieron generar imágenes a partir del PDF.");
      }

      // --- Step 2: Extract STRUCTURED Data from Each Image ---
      console.log(
        "[Server] Step 2: Extracting structured data per page using OpenAI..."
      );
      let pageCount = 0;
      const totalPages = tempImagePaths.length;
      const extractionPromises = [];

      for (const imagePath of tempImagePaths) {
        extractionPromises.push(
          (async (imgPath, pageNum) => {
            try {
              const base64Image = await fs.readFile(imgPath, {
                encoding: "base64",
              });
              const pageJsonData = await openaiProcessor.extractDataFromPage(
                base64Image,
                pageNum,
                documentType
              );
              return pageJsonData;
            } catch (imageProcessingError) {
              console.warn(
                `[Server] Warning processing page ${pageNum}: ${imageProcessingError.message}`
              );
              return null;
            }
          })(imagePath, ++pageCount)
        );
      }

      const pageResults = await Promise.all(extractionPromises);
      console.log(
        `[Server] Data extraction complete. Received results for ${
          pageResults.filter((r) => r !== null).length
        } out of ${totalPages} pages.`
      );

      const validPageResults = pageResults.filter((result) => result !== null);
      if (validPageResults.length === 0) {
        throw new Error(
          "No se pudo extraer información estructurada de ninguna página del documento."
        );
      }

      // --- Step 3: Merge Page Data ---
      console.log("[Server] Step 3: Merging data from all pages...");
      let finalJsonData;
      if (documentType === "acta-constitutiva") {
        finalJsonData = mergeActaConstitutivaData(validPageResults); // Use the refined merge function
      } else if (documentType === "lista-bloqueados") {
        finalJsonData = mergeListaBloqueadosData(validPageResults);
      } else {
        throw new Error(
          "Tipo de documento desconocido durante la fusión de datos."
        );
      }
      console.log("[Server] Merging complete.");
      // console.log("[Server] Final Merged JSON:", JSON.stringify(finalJsonData, null, 2)); // Uncomment for debugging

      // --- Step 4: Send Successful Response ---
      res.json({ success: true, data: finalJsonData });
    } catch (error) {
      // --- Error Handling ---
      console.error("[Server] Error during file processing pipeline:", error);
      const statusCode =
        error.message.includes("PDF") ||
        error.message.includes("Tipo de documento") ||
        error.status === 400
          ? 400
          : error.status === 429
          ? 429
          : 500;
      const clientErrorMessage =
        statusCode === 400 ||
        statusCode === 429 ||
        error.message.startsWith("La respuesta") ||
        error.message.startsWith("Error en la API") ||
        error.message.startsWith("No se pudo extraer")
          ? error.message
          : "Ocurrió un error inesperado en el servidor al procesar el documento.";

      res
        .status(statusCode)
        .json({ success: false, error: clientErrorMessage });
    } finally {
      // --- Step 5: Cleanup Temporary Files ---
      console.log("[Server] Step 5: Cleaning up temporary files...");
      if (uploadedFilePath) {
        await fs
          .unlink(uploadedFilePath)
          .catch((err) =>
            console.warn(`[Cleanup Warn] Failed to delete PDF: ${err.message}`)
          );
      }
      if (imageOutputDir) {
        await fs
          .rm(imageOutputDir, { recursive: true, force: true })
          .catch((err) =>
            console.warn(
              `[Cleanup Warn] Failed to delete image directory: ${err.message}`
            )
          );
      }
      console.log("[Server] Cleanup finished.");
    }
  }
);

// --- Start Server ---
ensureUploadDirExists()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
      console.log(`📊 Rutas principales:`);
      console.log(`   - Local: http://localhost:${port}${basePath}/`);
      console.log(`   - Desarrollo: http://localhost:${port}/`);
      console.log(`   - Producción (con proxy): https://kyc-servicios.com${basePath}/`);
      console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
      
      // Verificar si se ha configurado la API key de OpenAI
      if (process.env.OPENAI_API_KEY) {
        console.log("✅ OPENAI_API_KEY encontrada.");
      } else {
        console.warn("⚠️ OPENAI_API_KEY no configurada. La extracción de datos no funcionará correctamente.");
      }
    });
  })
  .catch((error) => {
    console.error("¡ERROR FATAL! No se pudo iniciar el servidor:", error);
    process.exit(1);
  });
