document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const uploadButton = document.getElementById('uploadButton');
    const spinner = document.getElementById('spinner');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsDiv = document.getElementById('results');

    // Asegurar que el spinner está oculto al inicio
    spinner.style.display = 'none';
    spinner.classList.add('d-none');

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Mostrar spinner solo cuando se está procesando
        spinner.style.display = 'inline-block';
        spinner.classList.remove('d-none');
        
        uploadButton.disabled = true;
        resultsContainer.classList.add('d-none');
        
        const fileInput = document.getElementById('document');
        const file = fileInput.files[0];
        
        if (!file) {
            showError('Por favor selecciona un archivo.');
            return;
        }
        
        // Validar tipo de archivo
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!validTypes.includes(file.type)) {
            showError('Tipo de archivo no soportado. Solo se permiten PDF, JPG, JPEG y PNG.');
            return;
        }
        
        // Crear FormData y añadir el archivo
        const formData = new FormData();
        formData.append('document', file);
        formData.append('documentType', 'acta-constitutiva');
        
        try {
            // Enviar solicitud al servidor
            const response = await fetch('/kyc-ocr-extractor/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Error al procesar el documento');
            }
            
            // Mostrar resultados
            displayResults(data);
        } catch (error) {
            showError(error.message);
        } finally {
            // Ocultar spinner
            spinner.style.display = 'none';
            spinner.classList.add('d-none');
            uploadButton.disabled = false;
        }
    });
    
    // Función para mostrar errores
    function showError(message) {
        spinner.style.display = 'none';
        spinner.classList.add('d-none');
        uploadButton.disabled = false;
        
        resultsContainer.classList.remove('d-none');
        resultsDiv.innerHTML = `<div class="error-message">${message}</div>`;
    }
    
    // Función para mostrar resultados
    function displayResults(data) {
        resultsContainer.classList.remove('d-none');
        
        // Intentar dar formato al JSON si viene como string
        let formattedData = data.data;
        let jsonData;
        
        if (typeof data.data === 'string') {
            try {
                // Si es JSON válido, parsearlo
                jsonData = JSON.parse(data.data);
                formattedData = JSON.stringify(jsonData, null, 4);
            } catch (e) {
                // Si no es JSON válido, usar el texto como está
                formattedData = data.data;
            }
        } else {
            // Si ya es un objeto, formatearlo
            jsonData = data.data;
            formattedData = JSON.stringify(data.data, null, 4);
        }
        
        // Mostrar el JSON en el formato text
        resultsDiv.textContent = formattedData;
        
        // Intentar crear la vista en tabla si es un objeto JSON válido
        if (jsonData && typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            createActaInfoTable(jsonData);
        }
    }
    
    // Función para crear una tabla con la información del acta constitutiva
    function createActaInfoTable(actaData) {
        // Remover cualquier tabla existente
        const existingTable = document.querySelector('.table-container');
        if (existingTable) {
            existingTable.remove();
        }
        
        const tableContainer = document.createElement('div');
        tableContainer.classList.add('table-container');
        
        // Crear encabezado y contenedor de la tabla
        tableContainer.innerHTML = `
            <h3>Vista en Tabla</h3>
            <div class="tab-container">
                <div class="tab-buttons">
                    <button class="tab-button active" data-tab="general">Información General</button>
                    <button class="tab-button" data-tab="partners">Socios</button>
                    <button class="tab-button" data-tab="details">Detalles Adicionales</button>
                </div>
                <div class="tab-content">
                    <div class="tab active" id="general-tab">
                        ${createGeneralInfoTable(actaData)}
                    </div>
                    <div class="tab" id="partners-tab">
                        ${createPartnersTable(actaData)}
                    </div>
                    <div class="tab" id="details-tab">
                        ${createDetailsTable(actaData)}
                    </div>
                </div>
            </div>
        `;
        
        // Agregar la tabla al contenedor de resultados
        resultsContainer.appendChild(tableContainer);
        
        // Configurar los botones de pestañas
        const tabButtons = tableContainer.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Quitar clase activa de todos los botones y pestañas
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tableContainer.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                
                // Agregar clase activa al botón actual
                this.classList.add('active');
                
                // Mostrar la pestaña correspondiente
                const tabId = this.getAttribute('data-tab');
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });
    }
    
    // Función para crear la tabla de información general
    function createGeneralInfoTable(actaData) {
        return `
            <table class="acta-info-table">
                <tbody>
                    <tr>
                        <th>Razón Social</th>
                        <td>${actaData.companyName || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Objeto Social</th>
                        <td>${formatLongText(actaData.businessPurpose) || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Duración</th>
                        <td>${actaData.duration || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Capital Social</th>
                        <td>${actaData.capital || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Forma de Administración</th>
                        <td>${actaData.managementForm || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Representante Legal</th>
                        <td>${actaData.legalRepresentative || 'No especificado'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }
    
    // Función para crear la tabla de socios
    function createPartnersTable(actaData) {
        // Si no hay socios o no es un array, mostrar mensaje
        if (!actaData.partners || !Array.isArray(actaData.partners) || actaData.partners.length === 0) {
            return '<p>No se encontraron datos de socios en el documento.</p>';
        }
        
        // Crear tabla de socios
        return `
            <table class="acta-info-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Nacionalidad</th>
                        <th>Domicilio</th>
                        <th>Aportación</th>
                    </tr>
                </thead>
                <tbody>
                    ${actaData.partners.map(partner => `
                        <tr>
                            <td>${partner.name || 'No especificado'}</td>
                            <td>${partner.nationality || 'No especificado'}</td>
                            <td>${partner.address || 'No especificado'}</td>
                            <td>${partner.contribution || actaData.contributions || 'No especificado'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    // Función para crear la tabla de detalles adicionales
    function createDetailsTable(actaData) {
        return `
            <table class="acta-info-table">
                <tbody>
                    <tr>
                        <th>Distribución de Utilidades</th>
                        <td>${actaData.profitDistribution || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Fondo de Reserva</th>
                        <td>${actaData.reserveFund || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Comisarios</th>
                        <td>${actaData.commissioners || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Casos de Disolución</th>
                        <td>${formatLongText(actaData.dissolutionCases) || 'No especificado'}</td>
                    </tr>
                    <tr>
                        <th>Bases para Liquidación</th>
                        <td>${formatLongText(actaData.liquidationBasis) || 'No especificado'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }
    
    // Función para formatear textos largos
    function formatLongText(text) {
        if (!text) return '';
        
        if (text.length > 150) {
            return `<div class="expandable-text">
                        <div class="short-text">${text.substring(0, 150)}... <button class="expand-btn">Ver más</button></div>
                        <div class="full-text" style="display: none;">${text} <button class="collapse-btn">Ver menos</button></div>
                    </div>`;
        }
        
        return text;
    }
    
    // Delegación de eventos para los botones de expandir/colapsar texto
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('expand-btn')) {
            const container = e.target.closest('.expandable-text');
            container.querySelector('.short-text').style.display = 'none';
            container.querySelector('.full-text').style.display = 'block';
        } else if (e.target.classList.contains('collapse-btn')) {
            const container = e.target.closest('.expandable-text');
            container.querySelector('.short-text').style.display = 'block';
            container.querySelector('.full-text').style.display = 'none';
        }
    });
}); 