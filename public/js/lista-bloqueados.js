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
        formData.append('documentType', 'lista-bloqueados');
        
        try {
            // Enviar solicitud al servidor
            const response = await fetch('/api/upload', {
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
        if (typeof data.data === 'string') {
            try {
                // Si es JSON válido, parsearlo
                const jsonData = JSON.parse(data.data);
                formattedData = JSON.stringify(jsonData, null, 4);
            } catch (e) {
                // Si no es JSON válido, usar el texto como está
                formattedData = data.data;
            }
        } else {
            // Si ya es un objeto, formatearlo
            formattedData = JSON.stringify(data.data, null, 4);
        }
        
        resultsDiv.textContent = formattedData;

        // Opcional: Mostrar una tabla con las personas/entidades bloqueadas
        if (data.data && Array.isArray(JSON.parse(formattedData))) {
            createBlockedPersonsTable(JSON.parse(formattedData));
        }
    }

    // Función para crear una tabla con las personas bloqueadas
    function createBlockedPersonsTable(persons) {
        if (!persons.length) return;

        const tableContainer = document.createElement('div');
        tableContainer.classList.add('table-container');
        tableContainer.innerHTML = `
            <h3>Vista en Tabla</h3>
            <table class="blocked-persons-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Tipo</th>
                        <th>Alias</th>
                        <th>Información Adicional</th>
                    </tr>
                </thead>
                <tbody>
                    ${persons.map(person => `
                        <tr>
                            <td>${person.fullName || 'No especificado'}</td>
                            <td>${person.type || 'No especificado'}</td>
                            <td>${Array.isArray(person.aliases) ? person.aliases.join(', ') : (person.aliases || 'Ninguno')}</td>
                            <td>${person.additionalInfo || 'Ninguna'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        resultsContainer.appendChild(tableContainer);
    }
}); 