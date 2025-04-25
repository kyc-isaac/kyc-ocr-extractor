document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("uploadForm");
  const uploadButton = document.getElementById("uploadButton");
  const buttonText = document.getElementById("buttonText") || document.createElement("span");
  const spinner = document.querySelector(".spinner");
  const copyButton = document.getElementById("copyButton");
  const resultsDiv = document.getElementById("results");

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

  // Agregar manejador para el envío del formulario
  if (uploadForm) {
    uploadForm.addEventListener("submit", function(event) {
      // Mostrar el spinner y deshabilitar el botón durante el envío
      if (uploadButton) {
        uploadButton.disabled = true;
        if (spinner) spinner.style.display = "inline-block";
        if (buttonText) buttonText.textContent = "Procesando...";
      }
      
      // Validar el formulario
      const fileInput = document.getElementById("document");
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        alert("Por favor, selecciona un archivo PDF.");
        event.preventDefault();
        resetFormState();
        return false;
      }
      
      const file = fileInput.files[0];
      if (file.type !== "application/pdf") {
        alert("Solo se permiten archivos PDF.");
        event.preventDefault();
        resetFormState();
        return false;
      }
      
      // Continuar con el envío del formulario (POST al action especificado)
      return true;
    });
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

  // Función para resetear el estado del formulario
  function resetFormState() {
    if (uploadButton) {
      uploadButton.disabled = false;
      if (spinner) spinner.style.display = "none";
      if (buttonText) buttonText.textContent = "Procesar Documento";
    }
  }
});
