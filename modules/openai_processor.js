const OpenAI = require('openai');
const fs = require('fs').promises; // Using promises version of fs

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// --- Prompts for Different Document Types ---

const prompts = {
    'acta-constitutiva': `
        Eres un asistente experto en analizar actas constitutivas mexicanas. Extrae la siguiente información CLAVE del texto o imagen proporcionada y devuélvela EXCLUSIVAMENTE en formato JSON válido. No incluyas explicaciones adicionales, solo el JSON.

        Campos a extraer (usa estas claves exactas en inglés en el JSON):
        - "companyName": Razón o denominación social completa. Busca términos como S.A. de C.V., S. de R.L., etc.
        - "incorporationDate": Fecha de constitución (si se encuentra).
        - "partners": Un array de objetos, donde cada objeto representa un socio y contiene:
            - "name": Nombre completo del socio.
            - "nationality": Nacionalidad (si se menciona).
            - "address": Domicilio (si se menciona).
            - "contribution": Aporte al capital (si se detalla).
        - "businessPurpose": Objeto social (descripción de las actividades de la empresa).
        - "capital": Monto del capital social total.
        - "duration": Duración de la sociedad (ej. "99 años", "Indefinida").
        - "legalRepresentative": Nombre del representante legal o administrador(es).
        - "notaryInfo": Nombre y número del notario público y datos del registro (si se encuentran).

        Si alguna información no está presente o no es clara en el fragmento proporcionado, usa null o un array vacío ([]) según corresponda para el campo en el JSON. Asegúrate de que la salida sea únicamente un objeto JSON válido.
    `,
    'lista-bloqueados': `
        Eres un asistente experto en analizar listas de personas bloqueadas (LPB) o sancionadas. Extrae la información de cada persona o entidad listada en el texto o imagen proporcionada y devuélvela EXCLUSIVAMENTE como un array JSON válido. Cada elemento del array debe ser un objeto JSON representando a una persona/entidad. No incluyas explicaciones adicionales, solo el array JSON.

        Campos a extraer por cada entrada (usa estas claves exactas en inglés en el JSON):
        - "fullName": Nombre completo de la persona o entidad.
        - "type": Tipo ('Persona Física' o 'Entidad/Empresa'). Infiere si no está explícito.
        - "aliases": Un array de strings con los alias o nombres alternativos (ej. ["Alias 1", "Juan N."]). Usa un array vacío si no hay alias.
        - "rfc": RFC (Registro Federal de Contribuyentes), si se encuentra.
        - "curp": CURP (Clave Única de Registro de Población), si se encuentra.
        - "birthDate": Fecha de nacimiento (formato YYYY-MM-DD si es posible, o como aparezca). Usa null si no se encuentra.
        - "reason": Motivo del bloqueo o sanción (si se menciona).
        - "sourceList": Nombre o referencia de la lista de origen (si se menciona, ej. "Lista SAT 69-B", "OFAC").

        Si alguna información no está presente, usa null o un array vacío ([]) para el campo correspondiente. Asegúrate de que la salida sea únicamente un array JSON válido. Presta atención a tablas o listas.
    `,
    'structure-acta-constitutiva': `
        A partir del siguiente texto agregado (que puede provenir de varias páginas de un acta constitutiva mexicana), estructura la información CLAVE en un único objeto JSON. Combina la información de manera coherente.

        Campos a extraer (usa estas claves exactas en inglés en el JSON):
        - "companyName": Razón o denominación social completa.
        - "incorporationDate": Fecha de constitución.
        - "partners": Un array de objetos (name, nationality, address, contribution).
        - "businessPurpose": Objeto social.
        - "capital": Capital social total.
        - "duration": Duración de la sociedad.
        - "legalRepresentative": Representante(s) legal(es).
        - "notaryInfo": Datos del notario y registro.

        Si alguna información no está presente, usa null o un array vacío ([]). Devuelve SOLO el objeto JSON.

        Texto Agregado:
        ---
        {aggregated_text}
        ---
    `,
     'structure-lista-bloqueados': `
        A partir del siguiente texto agregado (que puede provenir de varias páginas de una lista de personas bloqueadas), extrae TODAS las personas o entidades listadas y devuélvelas como un único array JSON. Cada elemento debe ser un objeto con los campos: "fullName", "type", "aliases" (array), "rfc", "curp", "birthDate", "reason", "sourceList".

        Si alguna información no está presente, usa null o un array vacío ([]). Devuelve SOLO el array JSON. Asegúrate de no duplicar entradas si aparecen en múltiples fragmentos de texto.

        Texto Agregado:
        ---
        {aggregated_text}
        ---
    `
};

/**
 * Extracts structured data from a single image using OpenAI's GPT-4 Vision model.
 *
 * @param {string} base64Image - The base64 encoded string of the image.
 * @param {string} documentType - The type of document ('acta-constitutiva' or 'lista-bloqueados').
 * @returns {Promise<object|Array|null>} A promise that resolves with the extracted JSON data (object or array), or null if extraction fails.
 * @throws {Error} If the OpenAI API call fails or returns an unexpected response.
 */
async function extractDataFromImage(base64Image, documentType) {
    const prompt = prompts[documentType];
    if (!prompt) {
        throw new Error(`Tipo de documento no soportado para extracción: ${documentType}`);
    }

    console.log(`[openai_processor] Enviando imagen a OpenAI para tipo: ${documentType}`);

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Use the appropriate vision model
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/png;base64,${base64Image}`, // Assuming PNG from pdf-img-convert
                                detail: "high" // Use high detail for better OCR potential
                            },
                        },
                    ],
                },
            ],
            max_tokens: 4000, // Adjust as needed, ensure it's enough for the JSON
            temperature: 0.2, // Lower temperature for more deterministic JSON output
            response_format: { type: "json_object" }, // Request JSON output directly if supported by the model version
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            console.warn("[openai_processor] OpenAI no devolvió contenido.");
            return null; // Return null or handle as appropriate
        }

        console.log("[openai_processor] Respuesta JSON cruda de OpenAI:", content);

        // Attempt to parse the JSON content
        try {
            const jsonData = JSON.parse(content);
            console.log("[openai_processor] Extracción de JSON exitosa.");
            return jsonData;
        } catch (jsonError) {
            console.error("[openai_processor] Error al parsear JSON de OpenAI:", jsonError);
            console.error("[openai_processor] Contenido recibido:", content);
            // Optionally, try to clean up the string if it's close to JSON
            // For now, throw an error or return null
             throw new Error(`La respuesta de OpenAI no fue un JSON válido. Contenido: ${content}`);
            // return null;
        }

    } catch (error) {
        console.error("[openai_processor] Error llamando a la API de OpenAI:", error);
        // Rethrow or handle specific API errors (rate limits, auth issues, etc.)
        throw new Error(`Error en la API de OpenAI: ${error.message}`);
    }
}


/**
 * Structures aggregated text from multiple pages using OpenAI.
 *
 * @param {string} aggregatedText - The combined text from all pages.
 * @param {string} documentType - The type of document ('acta-constitutiva' or 'lista-bloqueados').
 * @returns {Promise<object|Array|null>} A promise resolving to the structured JSON data.
 * @throws {Error} If the structuring process fails.
 */
async function structureAggregatedText(aggregatedText, documentType) {
    const structurePromptKey = `structure-${documentType}`;
    let prompt = prompts[structurePromptKey];

    if (!prompt) {
        console.warn(`[openai_processor] No specific structuring prompt for ${documentType}. Returning raw text.`);
        // Fallback: return the aggregated text itself or a simple object
        return { aggregatedText: aggregatedText };
        // Or throw new Error(`Tipo de documento no soportado para estructuración: ${documentType}`);
    }

    // Replace placeholder in the prompt with the actual text
    prompt = prompt.replace('{aggregated_text}', aggregatedText);

    console.log(`[openai_processor] Enviando texto agregado a OpenAI para estructurar (${documentType})`);

     try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Or another suitable model like gpt-4-turbo
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            max_tokens: 4000,
            temperature: 0.2,
            response_format: { type: "json_object" }, // Request JSON
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            console.warn("[openai_processor] OpenAI no devolvió contenido para estructuración.");
            return null;
        }

        console.log("[openai_processor] Respuesta JSON estructurada cruda de OpenAI:", content);

        try {
            const jsonData = JSON.parse(content);
            console.log("[openai_processor] Estructuración de JSON exitosa.");
            return jsonData;
        } catch (jsonError) {
            console.error("[openai_processor] Error al parsear JSON estructurado de OpenAI:", jsonError);
            console.error("[openai_processor] Contenido recibido:", content);
             throw new Error(`La respuesta de estructuración de OpenAI no fue un JSON válido. Contenido: ${content}`);
        }

    } catch (error) {
        console.error("[openai_processor] Error llamando a la API de OpenAI para estructuración:", error);
        throw new Error(`Error en la API de OpenAI durante la estructuración: ${error.message}`);
    }
}


module.exports = {
    extractDataFromImage,
    structureAggregatedText,
};
