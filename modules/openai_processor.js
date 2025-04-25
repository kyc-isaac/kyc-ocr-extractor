const OpenAI = require("openai");
const fs = require("fs").promises;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Prompts for extracting STRUCTURED DATA from a SINGLE PAGE ---

const prompts = {
  "acta-constitutiva": `
        Analiza la imagen de ESTA PÁGINA de un acta constitutiva mexicana. Extrae SOLAMENTE la información CLAVE que encuentres VISIBLE EN ESTA PÁGINA y devuélvela en formato JSON.

        Campos a extraer SI ESTÁN PRESENTES EN ESTA PÁGINA (usa estas claves exactas en inglés):
        - "companyName": Razón o denominación social completa si aparece claramente.
        - "companyRfc": El RFC de la sociedad (12 caracteres) si aparece claramente asociado a la razón social.
        - "incorporationDate": Fecha de constitución si se menciona explícitamente en esta página.
        - "partners": Un array de objetos, SOLO para los socios cuyos detalles (nombre, RFC, CURP, nacionalidad, dirección, contribución) aparezcan EN ESTA PÁGINA. Incluye solo los campos encontrados en esta página:
            - "name": Nombre completo.
            - "rfc": RFC (13 caracteres). Valida formato si es posible.
            - "curp": CURP (18 caracteres). Valida formato si es posible.
            - "nationality": Nacionalidad.
            - "address": Domicilio.
            - "contribution": Aporte.
        - "businessPurposeChunk": Fragmento del objeto social descrito EN ESTA PÁGINA.
        - "capital": Un objeto con "amount", "currency", "description" SI se define el capital social EN ESTA PÁGINA.
        - "duration": Duración de la sociedad si se especifica EN ESTA PÁGINA.
        - "managementBodyChunk": Descripción del órgano de administración o nombres de miembros mencionados EN ESTA PÁGINA.
        - "legalRepresentativesChunk": Nombres de representantes legales o apoderados mencionados EN ESTA PÁGINA.
        - "notaryInfo": Objeto con "name", "number", "location" SI se menciona información del notario/corredor EN ESTA PÁGINA.
        - "registrationDataChunk": Datos de inscripción en RPC mencionados EN ESTA PÁGINA.

        MUY IMPORTANTE:
        - Si un campo NO aparece en esta página específica, NO lo incluyas en el JSON o usa null. Por ejemplo, si no hay socios en esta página, devuelve "partners": []. Si no se menciona el capital, devuelve "capital": null.
        - NO inventes información ni intentes recordar datos de otras páginas. Analiza solo la imagen proporcionada.
        - Tu respuesta debe ser únicamente el objeto JSON válido, sin explicaciones, comentarios, ni formato markdown.

        Analiza la imagen de esta página.
    `,
  "lista-bloqueados": `
        Analiza la imagen de ESTA PÁGINA de una lista de personas bloqueadas (LPB) o sancionadas. Extrae TODAS las entradas de personas o entidades COMPLETAS que encuentres VISIBLES EN ESTA PÁGINA y devuélvelas como un array JSON dentro de una clave "entries".

        Para cada entrada encontrada EN ESTA PÁGINA, incluye un objeto con los siguientes campos (usa estas claves exactas en inglés):
        - "fullName": Nombre completo de la persona o entidad.
        - "type": Tipo ('Persona Física' o 'Entidad/Empresa'). Infiere si no está explícito.
        - "aliases": Un array de strings con los alias o nombres alternativos encontrados EN ESTA PÁGINA para esta entrada.
        - "rfc": RFC si se encuentra EN ESTA PÁGINA para esta entrada.
        - "curp": CURP si se encuentra EN ESTA PÁGINA para esta entrada.
        - "birthDate": Fecha de nacimiento si se encuentra EN ESTA PÁGINA para esta entrada.
        - "address": Domicilio o dirección si se encuentra EN ESTA PÁGINA para esta entrada.
        - "reason": Motivo del bloqueo o sanción si se menciona EN ESTA PÁGINA para esta entrada.
        - "sourceList": Nombre o referencia de la lista de origen si se menciona EN ESTA PÁGINA.

        MUY IMPORTANTE:
        - Si no encuentras NINGUNA entrada de persona/entidad en esta página, devuelve un JSON con un array vacío: {"entries": []}.
        - Si para una entrada específica no encuentras alguno de los campos (ej. RFC, CURP), usa null para ese campo dentro del objeto de esa entrada.
        - NO inventes información ni intentes recordar datos de otras páginas. Analiza solo la imagen proporcionada.
        - Tu respuesta debe ser únicamente el objeto JSON válido (con la clave "entries" conteniendo el array), sin explicaciones, comentarios, ni formato markdown.

        Analiza la imagen de esta página.
    `,
};

/**
 * Extracts structured data from a single page image using OpenAI.
 * Selects the appropriate prompt based on the document type.
 *
 * @param {string} base64Image - The base64 encoded string of the image.
 * @param {number} pageNum - The page number (for logging).
 * @param {string} documentType - The type of document ('acta-constitutiva' or 'lista-bloqueados').
 * @returns {Promise<object|null>} A promise resolving to the structured JSON object for the page, or null on error/blank.
 * @throws {Error} If the OpenAI API call fails or returns invalid JSON.
 */
async function extractDataFromPage(base64Image, pageNum, documentType) {
  // Select the correct prompt based on document type
  const prompt = prompts[documentType];
  if (!prompt) {
    console.error(
      `[openai_processor] Tipo de documento no soportado para extracción por página: ${documentType}`
    );
    throw new Error(`Tipo de documento no soportado: ${documentType}`);
  }

  console.log(
    `[openai_processor] Extrayendo datos estructurados de página: ${pageNum} (Tipo: ${documentType})`
  );

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Vision model
      messages: [
        {
          role: "system", // System message to reinforce JSON output
          content:
            "Eres un asistente experto en extracción de datos de documentos legales mexicanos. Analiza la imagen de la página proporcionada y devuelve la información solicitada ÚNICAMENTE en formato JSON válido. No incluyas explicaciones ni texto fuera del JSON.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt }, // Use the selected prompt
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: "high", // High detail for better OCR
              },
            },
          ],
        },
      ],
      max_tokens: 2048, // Reasonable limit for single-page extraction
      temperature: 0.1, // Low temperature for factual extraction
      response_format: { type: "json_object" }, // Request JSON format
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn(
        `[openai_processor] OpenAI no devolvió contenido para página ${pageNum} (Tipo: ${documentType}).`
      );
      return null; // Treat no content as blank/error
    }

    // console.log(`[openai_processor] Respuesta JSON cruda de OpenAI (Página ${pageNum}, Tipo: ${documentType}):`, content.substring(0, 300) + "..."); // Debug

    // Attempt to parse the JSON content, cleaning potential markdown fences first
    try {
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.substring(7).trim();
        if (cleanedContent.endsWith("```")) {
          cleanedContent = cleanedContent.slice(0, -3).trim();
        }
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.substring(3).trim();
        if (cleanedContent.endsWith("```")) {
          cleanedContent = cleanedContent.slice(0, -3).trim();
        }
      }
      // Basic check for JSON structure (must be an object {})
      if (!cleanedContent.startsWith("{") || !cleanedContent.endsWith("}")) {
        console.error(
          `[openai_processor] Contenido limpiado para página ${pageNum} (Tipo: ${documentType}) no parece JSON válido:`,
          cleanedContent
        );
        throw new Error(
          `La respuesta de OpenAI para la página ${pageNum} (Tipo: ${documentType}) no tenía formato JSON de objeto válido.`
        );
      }

      const jsonData = JSON.parse(cleanedContent);
      // console.log(`[openai_processor] Estructuración JSON exitosa para página ${pageNum} (Tipo: ${documentType}).`); // Debug
      return jsonData; // Return the structured data object for this page
    } catch (jsonError) {
      console.error(
        `[openai_processor] Error al parsear JSON de OpenAI para página ${pageNum} (Tipo: ${documentType}):`,
        jsonError
      );
      console.error(
        `[openai_processor] Contenido recibido (Página ${pageNum}, Tipo: ${documentType}):`,
        content
      );
      throw new Error(
        `La respuesta de OpenAI para la página ${pageNum} (Tipo: ${documentType}) no fue un JSON válido. Error: ${jsonError.message}.`
      );
    }
  } catch (error) {
    console.error(
      `[openai_processor] Error llamando a OpenAI para página ${pageNum} (Tipo: ${documentType}):`,
      error
    );
    // Handle specific errors like rate limits if necessary
    if (error.status === 429) {
      console.error(
        `[openai_processor] Rate limit excedido procesando página ${pageNum} (Tipo: ${documentType}).`
      );
      // Consider adding a delay and retry mechanism here if needed
      throw new Error(
        `Rate limit excedido procesando página ${pageNum} (Tipo: ${documentType}). Intenta de nuevo más tarde o revisa tu plan de OpenAI.`
      );
    }
    throw new Error(
      `Error en la API de OpenAI procesando página ${pageNum} (Tipo: ${documentType}): ${error.message}`
    );
  }
}

module.exports = {
  extractDataFromPage, // Export the function that handles both document types
};
