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

  const basePath = window.BASE_PATH || "/kyc-ocr-extractor";
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
});
