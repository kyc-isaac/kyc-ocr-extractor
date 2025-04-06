document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const uploadButton = document.getElementById('uploadButton');
    const resultsCard = document.getElementById('resultsCard');
    const resultsDiv = document.getElementById('results');
    const spinner = uploadButton.querySelector('.spinner-border');

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('document');
        const file = fileInput.files[0];

        if (!file) {
            showAlert('Por favor, selecciona un archivo', 'danger');
            return;
        }

        // Show loading state
        uploadButton.disabled = true;
        spinner.classList.remove('d-none');
        resultsCard.classList.add('d-none');

        const formData = new FormData();
        formData.append('document', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                displayResults(data.data);
            } else {
                showAlert(data.error || 'Error al procesar el documento', 'danger');
            }
        } catch (error) {
            showAlert('Error al conectar con el servidor', 'danger');
            console.error('Error:', error);
        } finally {
            // Reset loading state
            uploadButton.disabled = false;
            spinner.classList.add('d-none');
        }
    });

    function displayResults(data) {
        resultsDiv.innerHTML = '';
        
        // Split the data into sections
        const sections = data.split('\n\n');
        
        sections.forEach(section => {
            if (section.trim()) {
                const [title, ...content] = section.split('\n');
                const sectionDiv = document.createElement('div');
                sectionDiv.innerHTML = `
                    <h6>${title}</h6>
                    <p>${content.join('<br>')}</p>
                `;
                resultsDiv.appendChild(sectionDiv);
            }
        });

        resultsCard.classList.remove('d-none');
    }

    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        const existingAlert = document.querySelector('.alert');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        uploadForm.appendChild(alertDiv);
    }
}); 