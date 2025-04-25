document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("uploadForm");
  const uploadButton = document.getElementById("uploadButton");
  const buttonText = document.getElementById("buttonText");
  const spinner = uploadButton ? uploadButton.querySelector(".spinner") : null;
  const resultsContainer = document.getElementById("resultsContainer");
  const resultsDiv = document.getElementById("results");
  const errorMessageDiv = document.getElementById("errorMessage");
  const errorTextSpan = document.getElementById("errorText");
  const copyButton = document.getElementById("copyButton");
  const statusMessageDiv = document.getElementById("statusMessage"); // Get status message div
  const tableContainer = document.getElementById("tableContainer"); // Add table container reference

  const basePath = "/kyc-ocr-extractor";
  const uploadUrl = `${basePath}/api/upload`;

  if (uploadForm) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault(); // Prevent default form submission

      // --- UI Updates START ---
      if (uploadButton && spinner && buttonText) {
        uploadButton.disabled = true;
        spinner.style.display = "inline-block"; // Show spinner
        buttonText.textContent = "Procesando...";
      }
      if (statusMessageDiv) {
        statusMessageDiv.textContent =
          "Iniciando proceso... Convirtiendo PDF a imágenes..."; // Initial status
        statusMessageDiv.classList.remove("hidden");
      }
      if (resultsContainer) resultsContainer.classList.add("hidden"); // Hide results container initially
      if (errorMessageDiv) errorMessageDiv.classList.add("hidden"); // Hide error message initially
      if (resultsDiv) resultsDiv.textContent = "Esperando resultados..."; // Clear previous results text
      if (copyButton) copyButton.classList.add("hidden"); // Hide copy button initially
      if (tableContainer) tableContainer.innerHTML = ""; // Clear previous table results
      // --- UI Updates END ---

      const formData = new FormData(uploadForm);
      const fileInput = document.getElementById("document");

      // Basic file validation
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showError("Por favor, selecciona un archivo PDF.");
        resetButtonState();
        if (statusMessageDiv) statusMessageDiv.textContent = ""; // Clear status
        return;
      }
      const file = fileInput.files[0];
      if (file.type !== "application/pdf") {
        showError("Tipo de archivo inválido. Solo se permiten archivos PDF.");
        resetButtonState();
        if (statusMessageDiv) statusMessageDiv.textContent = ""; // Clear status
        return;
      }
      // Optional: Add file size check here if needed

      try {
        console.log(`Sending request to: ${uploadUrl}`);

        // --- Update Status Before Fetch ---
        if (statusMessageDiv) {
          // Provide a more informative message about the potentially long step
          statusMessageDiv.textContent =
            "Extrayendo texto con IA. Esto puede tardar varios minutos dependiendo del tamaño y complejidad del documento...";
        }
        // ---

        // Make the API call
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData,
          // Headers are automatically set for FormData by fetch
        });

        // --- Update Status After Fetch (before processing response) ---
        if (statusMessageDiv) {
          // Indicate that the main processing is done and we are getting results
          statusMessageDiv.textContent =
            "Procesamiento completado. Obteniendo y mostrando resultados...";
        }
        // ---

        // Parse the JSON response
        const result = await response.json();

        // Check for HTTP errors (like 500, 400)
        if (!response.ok) {
          // Use the error message from the JSON payload if available
          throw new Error(
            result.error || `Error del servidor: ${response.status}`
          );
        }

        // Check the 'success' flag in the JSON payload
        if (result.success) {
          // Display results
          displayResults(result.data);
          
          // Get document type to render appropriate table
          const docTypeInput = uploadForm.querySelector('input[name="documentType"]');
          const docType = docTypeInput ? docTypeInput.value : null;
          
          // Render table if table container exists
          if (tableContainer && result.data) {
            if (docType === "acta-constitutiva") {
              renderActaConstitutivaTable(result.data);
            } else if (docType === "lista-bloqueados") {
              renderListaBloqueadosTable(result.data);
            }
            tableContainer.classList.remove("hidden");
          }
          
          if (resultsContainer) resultsContainer.classList.remove("hidden"); // Show results container
          if (errorMessageDiv) errorMessageDiv.classList.add("hidden"); // Ensure error message is hidden on success
          if (copyButton) copyButton.classList.remove("hidden"); // Show copy button on success
          if (statusMessageDiv)
            statusMessageDiv.textContent = "¡Proceso finalizado con éxito!"; // Final success status
        } else {
          // Handle application-level errors reported in JSON
          showError(
            result.error ||
              "Ocurrió un error desconocido durante el procesamiento."
          );
          if (statusMessageDiv)
            statusMessageDiv.textContent = "Proceso finalizado con errores."; // Final error status
        }
      } catch (error) {
        // Handle fetch errors or errors thrown during response processing
        console.error("Fetch error:", error);
        showError(
          error.message || "Error de conexión o al procesar la solicitud."
        );
        if (statusMessageDiv)
          statusMessageDiv.textContent = "Error crítico durante el proceso."; // Critical error status
      } finally {
        // --- UI Cleanup ---
        // Re-enable button, hide spinner
        resetButtonState();
        // Optionally hide status message after a delay or keep it
        // Keep the status message visible longer so the user sees the final state
        /*
                 setTimeout(() => {
                     if (statusMessageDiv && !errorMessageDiv?.classList.contains('hidden')) {
                        // Keep status visible if there was an error shown
                     } else if (statusMessageDiv) {
                        // Hide status on success after a bit
                        // statusMessageDiv.classList.add('hidden');
                        // statusMessageDiv.textContent = ''; // Or clear it
                     }
                 }, 7000); // Hide after 7 seconds for example
                 */
        // --- UI Cleanup END ---
      }
    });
  }

  // Add event listener for the copy button
  if (copyButton && resultsDiv) {
    copyButton.addEventListener("click", () => {
      const jsonText = resultsDiv.textContent; // Get text directly from the div
      navigator.clipboard
        .writeText(jsonText)
        .then(() => {
          // Optional: Show a temporary success message on the button
          const originalText = copyButton.textContent;
          copyButton.textContent = "¡Copiado!";
          copyButton.classList.add("bg-green-700"); // Indicate success visually
          setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove("bg-green-700");
          }, 1500); // Reset after 1.5 seconds
        })
        .catch((err) => {
          console.error("Error al copiar JSON:", err);
          // Optional: Show an error message to the user
          alert(
            "No se pudo copiar el texto. Puede que necesites hacerlo manualmente."
          );
        });
    });
  }

  // Function to display results in the JSON area
  function displayResults(data) {
    if (resultsDiv) {
      try {
        // Format the JSON nicely for display with 2-space indentation
        resultsDiv.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        console.error("Error stringifying results:", e);
        resultsDiv.textContent = "Error al mostrar los resultados formateados.";
        // Show raw data if stringify fails
        // resultsDiv.textContent = data;
      }
    }
  }

  // Function to display error messages
  function showError(message) {
    if (errorMessageDiv && errorTextSpan) {
      errorTextSpan.textContent = message;
      errorMessageDiv.classList.remove("hidden"); // Show the error message area
    }
    // Ensure results container is hidden if error occurs before results are shown
    if (resultsContainer && copyButton?.classList.contains("hidden")) {
      // If copy button is hidden, results were likely not shown yet
      resultsContainer.classList.add("hidden");
    } else if (resultsContainer) {
      // If results were shown, keep container visible but clear results/hide copy button
      if (resultsDiv) resultsDiv.textContent = ""; // Clear results area on error
      if (copyButton) copyButton.classList.add("hidden"); // Hide copy button on error
    }
    // Clear table container if it exists
    if (tableContainer) {
      tableContainer.innerHTML = "";
      tableContainer.classList.add("hidden");
    }
  }

  // Function to reset the upload button state
  function resetButtonState() {
    if (uploadButton && spinner && buttonText) {
      uploadButton.disabled = false; // Re-enable button
      spinner.style.display = "none"; // Hide spinner
      // Reset button text based on the page's document type (more robust)
      const docTypeInput = uploadForm.querySelector(
        'input[name="documentType"]'
      );
      const docType = docTypeInput ? docTypeInput.value : null;
      if (docType === "acta-constitutiva" || docType === "lista-bloqueados") {
        buttonText.textContent = "Procesar Documento";
      } else {
        buttonText.textContent = "Procesar"; // Default fallback
      }
    }
  }
  
  // --- TABLE RENDERING FUNCTIONS ---
  
  // Function to render Acta Constitutiva data into an HTML table
  function renderActaConstitutivaTable(data) {
    if (!tableContainer || !data) return;
    
    let html = `
      <div class="mt-8">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Vista de Tabla</h3>
        
        <div class="mb-6 overflow-x-auto">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Información General</h4>
          <table class="min-w-full bg-white border border-gray-300 mb-4">
            <tbody>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">Razón Social</th>
                <td class="py-2 px-4">${data.companyName || 'No especificado'}</td>
              </tr>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">RFC</th>
                <td class="py-2 px-4">${data.companyRfc || 'No especificado'}</td>
              </tr>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">Fecha de Constitución</th>
                <td class="py-2 px-4">${data.incorporationDate || 'No especificado'}</td>
              </tr>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">Duración</th>
                <td class="py-2 px-4">${data.duration || 'No especificado'}</td>
              </tr>
              <tr>
                <th class="text-left py-2 px-4 bg-gray-100">Capital Social</th>
                <td class="py-2 px-4">${
                  data.capital ? 
                  `${data.capital.amount || ''} ${data.capital.currency || ''} ${data.capital.description || ''}` : 
                  'No especificado'
                }</td>
              </tr>
            </tbody>
          </table>
        </div>`;
        
    // Add Partners section if there are any
    if (data.partners && data.partners.length > 0) {
      html += `
        <div class="mb-6 overflow-x-auto">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Socios</h4>
          <table class="min-w-full bg-white border border-gray-300">
            <thead>
              <tr class="bg-gray-100 border-b">
                <th class="py-2 px-3 text-left">Nombre</th>
                <th class="py-2 px-3 text-left">RFC</th>
                <th class="py-2 px-3 text-left">CURP</th>
                <th class="py-2 px-3 text-left">Nacionalidad</th>
                <th class="py-2 px-3 text-left">Aportación</th>
              </tr>
            </thead>
            <tbody>`;
      
      data.partners.forEach(partner => {
        html += `
              <tr class="border-b">
                <td class="py-2 px-3">${partner.name || ''}</td>
                <td class="py-2 px-3">${partner.rfc || ''}</td>
                <td class="py-2 px-3">${partner.curp || ''}</td>
                <td class="py-2 px-3">${partner.nationality || ''}</td>
                <td class="py-2 px-3">${partner.contribution || ''}</td>
              </tr>`;
      });
      
      html += `
            </tbody>
          </table>
        </div>`;
    }
    
    // Add Notary Information
    if (data.notaryInfo) {
      html += `
        <div class="mb-6 overflow-x-auto">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Información Notarial</h4>
          <table class="min-w-full bg-white border border-gray-300">
            <tbody>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">Notario</th>
                <td class="py-2 px-4">${data.notaryInfo.name || 'No especificado'}</td>
              </tr>
              <tr class="border-b">
                <th class="text-left py-2 px-4 bg-gray-100">Número</th>
                <td class="py-2 px-4">${data.notaryInfo.number || 'No especificado'}</td>
              </tr>
              <tr>
                <th class="text-left py-2 px-4 bg-gray-100">Ubicación</th>
                <td class="py-2 px-4">${data.notaryInfo.location || 'No especificado'}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }
    
    // Add Object of Society if available
    if (data.businessPurpose) {
      html += `
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Objeto Social</h4>
          <div class="bg-white border border-gray-300 p-4">
            <p class="whitespace-pre-line">${data.businessPurpose}</p>
          </div>
        </div>`;
    }
    
    // Add Management Body if available
    if (data.managementBody) {
      html += `
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Administración</h4>
          <div class="bg-white border border-gray-300 p-4">
            <p class="whitespace-pre-line">${data.managementBody}</p>
          </div>
        </div>`;
    }
    
    // Add Legal Representatives if available
    if (data.legalRepresentatives && data.legalRepresentatives.length > 0) {
      html += `
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Representantes Legales</h4>
          <ul class="list-disc pl-5 space-y-1">`;
      
      data.legalRepresentatives.forEach(rep => {
        html += `<li>${rep}</li>`;
      });
      
      html += `
          </ul>
        </div>`;
    }
    
    // Close the main container
    html += `</div>`;
    
    tableContainer.innerHTML = html;
  }
  
  // Function to render Lista de Personas Bloqueadas into an HTML table
  function renderListaBloqueadosTable(data) {
    if (!tableContainer || !data) return;
    
    console.log('Data recibida para renderListaBloqueadosTable:', JSON.stringify(data).substring(0, 500) + '...');
    
    // Detectar la estructura del JSON y extraer las entradas
    let entries = [];
    if (data.entries && Array.isArray(data.entries)) {
      // Formato estándar: { entries: [...] }
      entries = data.entries;
    } else if (Array.isArray(data)) {
      // Formato alternativo: el array directamente
      entries = data;
    } else {
      // Buscar cualquier array en el primer nivel del objeto
      const possibleArrays = Object.values(data).filter(val => Array.isArray(val));
      if (possibleArrays.length > 0) {
        // Usar el primer array encontrado como entradas
        entries = possibleArrays[0];
      }
    }
    
    console.log(`Se detectaron ${entries.length} entradas para mostrar en la tabla`);
    
    let html = `
      <div class="mt-8">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Vista de Tabla</h3>`;
        
    if (!entries || entries.length === 0) {
      html += `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p class="text-yellow-700">No se detectaron entradas en formato tabular. Revisa el JSON para más detalles.</p>
        </div>`;
    } else {
      // Determinar las columnas basadas en las propiedades de la primera entrada
      const firstEntry = entries[0];
      const columns = [];
      
      // Columnas predefinidas en orden preferido (si existen en los datos)
      const preferredColumns = [
        { key: 'fullName', label: 'Nombre' },
        { key: 'name', label: 'Nombre' },
        { key: 'type', label: 'Tipo' },
        { key: 'rfc', label: 'RFC' },
        { key: 'curp', label: 'CURP' },
        { key: 'birthDate', label: 'Fecha Nac.' },
        { key: 'reason', label: 'Motivo' },
        { key: 'aliases', label: 'Alias' },
        { key: 'address', label: 'Dirección' },
        { key: 'sourceList', label: 'Fuente' }
      ];
      
      // Añadir columnas predefinidas si existen en los datos
      preferredColumns.forEach(col => {
        if (firstEntry.hasOwnProperty(col.key)) {
          columns.push(col);
        }
      });
      
      // Añadir cualquier columna adicional no incluida en las predefinidas
      Object.keys(firstEntry).forEach(key => {
        if (!columns.some(col => col.key === key) && 
            typeof firstEntry[key] !== 'object' && 
            key !== 'id' && 
            key !== '_id') {
          columns.push({ key, label: key.charAt(0).toUpperCase() + key.slice(1) });
        }
      });
      
      html += `
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white border border-gray-300">
            <thead>
              <tr class="bg-gray-100 border-b">`;
              
      // Generar encabezados dinámicamente
      columns.forEach(col => {
        html += `<th class="py-2 px-3 text-left">${col.label}</th>`;
      });
              
      html += `
              </tr>
            </thead>
            <tbody>`;
          
      entries.forEach(entry => {
        html += `<tr class="border-b">`;
        
        columns.forEach(col => {
          const value = entry[col.key];
          let displayValue = '';
          
          if (Array.isArray(value) && value.length > 0) {
            displayValue = value.join(', ');
          } else if (value !== null && value !== undefined) {
            displayValue = String(value);
          }
          
          html += `<td class="py-2 px-3">${displayValue}</td>`;
        });
        
        html += `</tr>`;
      });
      
      html += `
            </tbody>
          </table>
        </div>`;
    }
    
    // Close the main container
    html += `</div>`;
    
    tableContainer.innerHTML = html;
  }
});
