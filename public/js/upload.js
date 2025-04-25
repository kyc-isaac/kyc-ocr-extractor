document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const uploadButton = document.getElementById('uploadButton');
    const buttonText = document.getElementById('buttonText');
    const spinner = uploadButton ? uploadButton.querySelector('.spinner') : null; // Find spinner inside button
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsDiv = document.getElementById('results');
    const errorMessageDiv = document.getElementById('errorMessage');
    const errorTextSpan = document.getElementById('errorText');
    const copyButton = document.getElementById('copyButton'); // Get copy button

    // Get the base path from the environment (or set a default)
    // This assumes your server injects BASE_PATH into the HTML or you set it globally.
    // If not, you might need to hardcode it or use relative paths carefully.
    // Example of setting it globally in HTML (server-side):
    // <script>window.BASE_PATH = '<%= process.env.BASE_PATH || "" %>';</script>
    const basePath = window.BASE_PATH || '/kyc-ocr-extractor'; // Adjust if needed
    const uploadUrl = `${basePath}/api/upload`;

    if (uploadForm) {
        uploadForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Prevent default form submission

            // Disable button, show spinner, hide previous results/errors
            if (uploadButton && spinner && buttonText) {
                uploadButton.disabled = true;
                spinner.style.display = 'inline-block'; // Show spinner
                buttonText.textContent = 'Procesando...';
            }
            if (resultsContainer) resultsContainer.classList.add('hidden');
            if (errorMessageDiv) errorMessageDiv.classList.add('hidden');
            if (resultsDiv) resultsDiv.textContent = 'Procesando, por favor espera...'; // Clear previous results
            if (copyButton) copyButton.classList.add('hidden'); // Hide copy button initially


            const formData = new FormData(uploadForm);
            const fileInput = document.getElementById('document');

             // Basic file validation (optional, server validation is key)
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                showError('Por favor, selecciona un archivo PDF.');
                resetButtonState();
                return;
            }
             const file = fileInput.files[0];
             if (file.type !== 'application/pdf') {
                 showError('Tipo de archivo inválido. Solo se permiten archivos PDF.');
                 resetButtonState();
                 return;
             }
             // Optional: Add file size check here if needed

            try {
                console.log(`Sending request to: ${uploadUrl}`);
                const response = await fetch(uploadUrl, {
                    method: 'POST',
                    body: formData,
                    // Headers are automatically set for FormData by fetch
                });

                const result = await response.json();

                if (!response.ok) {
                    // Handle HTTP errors (like 500, 400)
                    throw new Error(result.error || `Error del servidor: ${response.status}`);
                }

                if (result.success) {
                    // Display results
                    displayResults(result.data);
                    if (resultsContainer) resultsContainer.classList.remove('hidden');
                    if (errorMessageDiv) errorMessageDiv.classList.add('hidden'); // Hide error message on success
                     if (copyButton) copyButton.classList.remove('hidden'); // Show copy button on success
                } else {
                    // Handle application-level errors reported in JSON
                    showError(result.error || 'Ocurrió un error desconocido.');
                }

            } catch (error) {
                console.error('Fetch error:', error);
                showError(error.message || 'Error de conexión o al procesar la solicitud.');
            } finally {
                // Re-enable button, hide spinner
                resetButtonState();
            }
        });
    }

     // Add event listener for the copy button
    if (copyButton && resultsDiv) {
        copyButton.addEventListener('click', () => {
            const jsonText = resultsDiv.textContent;
            navigator.clipboard.writeText(jsonText)
                .then(() => {
                    // Optional: Show a temporary success message
                    const originalText = copyButton.textContent;
                    copyButton.textContent = '¡Copiado!';
                    setTimeout(() => {
                        copyButton.textContent = originalText;
                    }, 1500); // Reset after 1.5 seconds
                })
                .catch(err => {
                    console.error('Error al copiar JSON:', err);
                    // Optional: Show an error message to the user
                    alert('No se pudo copiar el texto.');
                });
        });
    }

    function displayResults(data) {
        if (resultsDiv) {
            try {
                // Format the JSON nicely for display
                resultsDiv.textContent = JSON.stringify(data, null, 2); // Pretty print JSON
            } catch (e) {
                console.error("Error stringifying results:", e);
                resultsDiv.textContent = "Error al mostrar los resultados.";
            }
        }
    }

    function showError(message) {
        if (errorMessageDiv && errorTextSpan) {
            errorTextSpan.textContent = message;
            errorMessageDiv.classList.remove('hidden');
        }
         // Ensure results container is hidden if error occurs before results are shown
         if (resultsContainer && !copyButton?.classList.contains('hidden')) {
             // If results were previously shown, keep container visible but show error
         } else if (resultsContainer) {
            resultsContainer.classList.add('hidden');
         }
    }

    function resetButtonState() {
         if (uploadButton && spinner && buttonText) {
            uploadButton.disabled = false;
            spinner.style.display = 'none'; // Hide spinner
            // Reset button text based on the page (could be dynamic)
             if (document.title.includes("Actas Constitutivas")) {
                 buttonText.textContent = 'Procesar Documento';
             } else if (document.title.includes("Personas Bloqueadas")) {
                 buttonText.textContent = 'Procesar Documento';
             } else {
                 buttonText.textContent = 'Procesar'; // Default
             }
        }
    }
});
