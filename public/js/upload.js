document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("uploadForm");
  const uploadButton = document.getElementById("uploadButton");
  const buttonText = document.getElementById("buttonText") || document.createElement("span");
  const spinner = document.querySelector(".spinner");
  const resultsContainer = document.getElementById("resultsContainer");
  const resultsDiv = document.getElementById("results");
  const errorMessageDiv = document.getElementById("errorMessage");
  const errorTextSpan = document.getElementById("errorText");
  const copyButton = document.getElementById("copyButton");
  const statusMessageDiv = document.getElementById("statusMessage"); 
  const tableContainer = document.getElementById("tableContainer"); 

  // Variables globales para almacenar los datos de la tabla
  let currentEntries = [];
  let currentColumns = [];
  let currentDocumentInfo = {};

  // Asegurar que el botón tenga el texto y el spinner
  if (uploadButton) {
    if (!buttonText.parentNode) {
      buttonText.id = "buttonText";
      buttonText.textContent = "Procesar Documento";
      uploadButton.appendChild(buttonText);
    }
    
    // Verificar si existe el spinner
    if (!spinner) {
      const spinnerSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      spinnerSvg.classList.add("spinner", "animate-spin", "-ml-1", "mr-3", "h-5", "w-5", "text-white");
      spinnerSvg.setAttribute("fill", "none");
      spinnerSvg.setAttribute("viewBox", "0 0 24 24");
      spinnerSvg.style.display = "none";
      
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.classList.add("opacity-25");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "10");
      circle.setAttribute("stroke", "currentColor");
      circle.setAttribute("stroke-width", "4");
      
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("opacity-75");
      path.setAttribute("fill", "currentColor");
      path.setAttribute("d", "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z");
      
      spinnerSvg.appendChild(circle);
      spinnerSvg.appendChild(path);
      uploadButton.insertBefore(spinnerSvg, uploadButton.firstChild);
    }
  }

  // URL absoluta para evitar problemas relativos
  const basePath = "/kyc-ocr-extractor";
  const uploadUrl = window.location.origin + `${basePath}/api/upload`;

  // Manejar evento de clic en el botón de envío
  if (uploadButton && uploadForm) {
    console.log("JavaScript inicializado correctamente - Configurando evento para el botón");
    uploadButton.addEventListener("click", async function() {
      console.log("Botón clickeado - iniciando procesamiento");
      
      // Actualizar UI: mostrar spinner y deshabilitar botón
      uploadButton.disabled = true;
      if (spinner) spinner.style.display = "inline-block";
      if (buttonText) buttonText.textContent = "Procesando...";
      
      // Mostrar mensaje de estado
      if (statusMessageDiv) {
        statusMessageDiv.textContent = "Iniciando proceso... Convirtiendo PDF a imágenes...";
        statusMessageDiv.classList.remove("hidden");
      }
      
      // Resetear contenedores de resultados
      if (resultsContainer) resultsContainer.classList.add("hidden");
      if (errorMessageDiv) errorMessageDiv.classList.add("hidden");
      if (resultsDiv) resultsDiv.textContent = "Esperando resultados...";
      if (copyButton) copyButton.classList.add("hidden");
      if (tableContainer) tableContainer.innerHTML = "";
      
      // Validar el formulario
      const fileInput = document.getElementById("document");
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showError("Por favor, selecciona un archivo PDF.");
        resetFormState();
        return;
      }
      
      const file = fileInput.files[0];
      if (file.type !== "application/pdf") {
        showError("Solo se permiten archivos PDF.");
        resetFormState();
        return;
      }
      
      try {
        // Crear FormData para enviar
        const formData = new FormData(uploadForm);
        
        // Actualizar mensaje de estado
        if (statusMessageDiv) {
          statusMessageDiv.textContent = "Extrayendo texto con IA. Esto puede tardar varios minutos dependiendo del tamaño y complejidad del documento...";
        }
        
        // Enviar solicitud AJAX
        console.log(`Enviando solicitud a: ${uploadUrl}`);
        const response = await fetch(uploadUrl, {
          method: "POST",
          body: formData
        });
        
        // Actualizar mensaje de estado
        if (statusMessageDiv) {
          statusMessageDiv.textContent = "Procesamiento completado. Obteniendo y mostrando resultados...";
        }
        
        // Procesar respuesta
        const result = await response.json();
        
        // Verificar si hay errores HTTP
        if (!response.ok) {
          throw new Error(result.error || `Error del servidor: ${response.status}`);
        }
        
        // Verificar éxito en la respuesta
        if (result.success) {
          // Mostrar resultados
          displayResults(result.data);
          
          // Obtener tipo de documento
          const docTypeInput = uploadForm.querySelector('input[name="documentType"]');
          const docType = docTypeInput ? docTypeInput.value : null;
          
          // Renderizar tabla si es necesario
          if (tableContainer && result.data) {
            if (docType === "acta-constitutiva") {
              renderActaConstitutivaTable(result.data);
            } else if (docType === "lista-bloqueados") {
              renderListaBloqueadosTable(result.data);
            }
            tableContainer.classList.remove("hidden");
          }
          
          // Actualizar UI
          if (resultsContainer) resultsContainer.classList.remove("hidden");
          if (errorMessageDiv) errorMessageDiv.classList.add("hidden");
          if (copyButton) copyButton.classList.remove("hidden");
          if (statusMessageDiv) statusMessageDiv.textContent = "¡Proceso finalizado con éxito!";
        } else {
          // Mostrar error
          showError(result.error || "Ocurrió un error desconocido durante el procesamiento.");
          if (statusMessageDiv) statusMessageDiv.textContent = "Proceso finalizado con errores.";
        }
      } catch (error) {
        // Manejar errores
        console.error("Error en la solicitud:", error);
        showError(error.message || "Error de conexión o al procesar la solicitud.");
        if (statusMessageDiv) statusMessageDiv.textContent = "Error crítico durante el proceso.";
      } finally {
        // Resetear estado del botón
        resetFormState();
      }
    });
  } else {
    console.error("No se encontró el botón o el formulario en el DOM");
  }

  // Funcionalidad para copiar JSON
  if (copyButton && resultsDiv) {
    copyButton.addEventListener("click", function() {
      const jsonText = resultsDiv.textContent;
      navigator.clipboard.writeText(jsonText)
        .then(() => {
          const originalText = copyButton.textContent;
          copyButton.textContent = "¡Copiado!";
          copyButton.classList.add("bg-green-700");
          setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove("bg-green-700");
          }, 1500);
        })
        .catch(err => {
          console.error("Error al copiar:", err);
          alert("No se pudo copiar el texto. Puede que necesites hacerlo manualmente.");
        });
    });
  }

  // Función para mostrar resultados
  function displayResults(data) {
    if (resultsDiv) {
      try {
        // Formatear JSON para mostrar
        resultsDiv.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        console.error("Error al formatear resultados:", e);
        resultsDiv.textContent = "Error al mostrar los resultados formateados.";
      }
    }
  }

  // Función para mostrar errores
  function showError(message) {
    if (errorMessageDiv && errorTextSpan) {
      errorTextSpan.textContent = message;
      errorMessageDiv.classList.remove("hidden");
    }
    // Asegurar que los resultados se oculten si hay error
    if (resultsContainer && copyButton?.classList.contains("hidden")) {
      resultsContainer.classList.add("hidden");
    } else if (resultsContainer) {
      if (resultsDiv) resultsDiv.textContent = "";
      if (copyButton) copyButton.classList.add("hidden");
    }
    // Limpiar tabla si existe
    if (tableContainer) {
      tableContainer.innerHTML = "";
      tableContainer.classList.add("hidden");
    }
  }

  // Función para resetear el estado del formulario
  function resetFormState() {
    if (uploadButton) {
      uploadButton.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (buttonText) buttonText.textContent = "Procesar Documento";
    }
  }
  
  // Función para renderizar la tabla de Acta Constitutiva
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
        
    // Añadir sección de socios si existen
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
    
    // Añadir información notarial
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
    
    // Añadir objeto social
    if (data.businessPurpose) {
      html += `
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Objeto Social</h4>
          <div class="bg-white border border-gray-300 p-4">
            <p class="whitespace-pre-line">${data.businessPurpose}</p>
          </div>
        </div>`;
    }
    
    // Añadir administración
    if (data.managementBody) {
      html += `
        <div class="mb-6">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Administración</h4>
          <div class="bg-white border border-gray-300 p-4">
            <p class="whitespace-pre-line">${data.managementBody}</p>
          </div>
        </div>`;
    }
    
    // Añadir representantes legales
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
    
    // Cerrar el contenedor principal
    html += `</div>`;
    
    tableContainer.innerHTML = html;
  }
  
  // Función para renderizar la tabla de Lista de Bloqueados
  function renderListaBloqueadosTable(data) {
    if (!tableContainer || !data) return;
    
    console.log('Data recibida para la tabla:', JSON.stringify(data).substring(0, 500) + '...');
    
    // Detectar la estructura del JSON
    let entries = [];
    if (data.entries && Array.isArray(data.entries)) {
      entries = data.entries;
    } else if (Array.isArray(data)) {
      entries = data;
    } else {
      const possibleArrays = Object.values(data).filter(val => Array.isArray(val));
      if (possibleArrays.length > 0) {
        entries = possibleArrays[0];
      }
    }
    
    console.log(`Se detectaron ${entries.length} entradas para mostrar en la tabla`);
    
    // Guardar los datos actuales en las variables globales
    currentEntries = entries;
    currentDocumentInfo = {
      documentNumber: data.documentNumber,
      documentType: data.documentType,
      agreement: data.agreement
    };
    
    let html = `
      <div class="mt-8">
        <h3 class="text-xl font-semibold text-gray-800 mb-4">Vista de Tabla</h3>`;
        
    // Mostrar información del documento si está disponible
    if (data.documentNumber || data.documentType || data.agreement) {
      html += `
        <div class="document-info">
          <h4>Información del Documento</h4>
          <table>`;
      
      if (data.documentNumber) {
        html += `
              <tr>
                <th>Número de Oficio</th>
                <td>${data.documentNumber}</td>
              </tr>`;
      }
      
      if (data.documentType) {
        html += `
              <tr>
                <th>Tipo de Documento</th>
                <td>${data.documentType}</td>
              </tr>`;
      }
      
      if (data.agreement) {
        html += `
              <tr>
                <th>Acuerdo</th>
                <td>${data.agreement}</td>
              </tr>`;
      }
      
      html += `
            </table>
          </div>`;
    }
        
    if (!entries || entries.length === 0) {
      html += `
        <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
          <p class="text-yellow-700">No se detectaron entradas en formato tabular. Revisa el JSON para más detalles.</p>
        </div>`;
    } else {
      // Determinar columnas basadas en la primera entrada
      const firstEntry = entries[0];
      const columns = [];
      
      // Columnas predefinidas en orden preferido
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
      
      // Añadir cualquier columna adicional
      Object.keys(firstEntry).forEach(key => {
        if (!columns.some(col => col.key === key) && 
            typeof firstEntry[key] !== 'object' && 
            key !== 'id' && 
            key !== '_id') {
          columns.push({ key, label: key.charAt(0).toUpperCase() + key.slice(1) });
        }
      });
      
      // Guardar las columnas actuales
      currentColumns = columns;
      
      html += `
        <div class="overflow-x-auto">
          <h4 class="text-lg font-semibold text-gray-700 mb-2">Personas y Entidades</h4>
          <table class="data-table">
            <thead>
              <tr>`;
              
      // Generar encabezados dinámicamente
      columns.forEach(col => {
        html += `<th>${col.label}</th>`;
      });
              
      html += `
              </tr>
            </thead>
            <tbody>`;
          
      entries.forEach(entry => {
        html += `<tr>`;
        
        columns.forEach(col => {
          const value = entry[col.key];
          let displayValue = '';
          
          if (Array.isArray(value) && value.length > 0) {
            displayValue = value.join(', ');
          } else if (value !== null && value !== undefined) {
            displayValue = String(value);
          }
          
          html += `<td>${displayValue}</td>`;
        });
        
        html += `</tr>`;
      });
      
      html += `
            </tbody>
          </table>
        </div>`;
    }
    
    // Cerrar el contenedor principal
    html += `</div>`;
    
    tableContainer.innerHTML = html;

    // Mostrar el botón de exportación a Excel
    const exportButton = document.getElementById('exportTableButton');
    if (exportButton) {
      exportButton.classList.remove('hidden');
      exportButton.addEventListener('click', exportToExcel);
    }
  }

  // Función para exportar a Excel
  function exportToExcel() {
    if (!currentEntries.length) {
      console.error('No hay datos para exportar');
      return;
    }

    // Crear un libro de Excel
    const wb = XLSX.utils.book_new();
    
    // Crear hoja de información del documento
    const docInfo = [
      ['Información del Documento'],
      ['Número de Oficio', currentDocumentInfo.documentNumber || ''],
      ['Tipo de Documento', currentDocumentInfo.documentType || ''],
      ['Acuerdo', currentDocumentInfo.agreement || ''],
      ['', ''], // Línea en blanco
      ['Personas y Entidades Bloqueadas'],
      ['', ''] // Línea en blanco
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(docInfo);
    
    // Ajustar el ancho de las columnas para la información del documento
    wsInfo['!cols'] = [{ wch: 20 }, { wch: 50 }];
    
    // Añadir la hoja de información al libro
    XLSX.utils.book_append_sheet(wb, wsInfo, "Información");
    
    // Convertir los datos a formato de hoja de cálculo
    const wsData = currentEntries.map(entry => {
      const row = {};
      currentColumns.forEach(col => {
        const value = entry[col.key];
        row[col.label] = Array.isArray(value) ? value.join(', ') : value;
      });
      return row;
    });
    
    // Crear la hoja de cálculo de personas
    const ws = XLSX.utils.json_to_sheet(wsData);
    
    // Ajustar el ancho de las columnas
    const wscols = currentColumns.map(() => ({ wch: 30 }));
    ws['!cols'] = wscols;
    
    // Añadir la hoja de personas al libro
    XLSX.utils.book_append_sheet(wb, ws, "Personas");
    
    // Generar el archivo Excel
    const fileName = `lista_bloqueados_${currentDocumentInfo.documentNumber || 'sin_numero'}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
});
