# Extractor de Documentos

Sistema para extraer información estructurada de documentos mediante OCR y procesamiento de lenguaje natural. Actualmente soporta dos tipos de documentos:

1. **Actas Constitutivas Mexicanas**: Extrae información clave de actas constitutivas, como razón social, socios, objeto social, etc.
2. **Listas de Personas Bloqueadas (LPB)**: Extrae información de personas y entidades incluidas en listas de bloqueados, identificando nombres, alias y datos adicionales.

## Requisitos

- Node.js (versión 14 o superior)
- NPM
- Poppler (para la conversión de PDF a imágenes)
- Cairo (dependencia de Poppler)
- Una clave API de OpenAI

## Instalación

1. Clonar el repositorio:
   ```
   git clone <URL_DEL_REPOSITORIO>
   cd kyc-ocr-extractor
   ```

2. Instalar las dependencias:
   ```
   npm install
   ```

3. Instalar Poppler y sus dependencias:

   **En macOS (Recomendado):**
   Usa nuestro script de instalación automatizado que configura todas las dependencias:
   ```
   ./install-mac.sh
   ```
   Este script instalará Homebrew (si no está instalado), Node.js, Poppler y Cairo.

   **Instalación manual en macOS:**
   ```
   brew install poppler
   brew install cairo
   ```

   **En Windows:**
   - Descargar la última versión desde: https://github.com/oschwartz10612/poppler-windows/releases/
   - Extraer el contenido y agregar la carpeta `bin` al PATH del sistema

   **En Linux (Ubuntu/Debian):**
   ```
   sudo apt-get install poppler-utils
   sudo apt-get install libcairo2-dev
   ```

4. Crear un archivo `.env` en la raíz del proyecto con tu clave API de OpenAI:
   ```
   OPENAI_API_KEY=tu_clave_api_aqui
   ```

## Ejecutar el Proyecto

1. Iniciar el servidor:
   ```
   npm start
   ```

2. Abrir un navegador web y acceder a:
   ```
   http://localhost:3000
   ```

## Solución de problemas

### macOS
Si encuentras errores relacionados con bibliotecas faltantes en macOS como:
```
dyld[XXXXX]: Library not loaded: /usr/local/opt/cairo/lib/libcairo.2.dylib
```

Ejecuta nuestro script de instalación:
```
./install-mac.sh
```

El proyecto ahora incluye una detección automática para macOS y utilizará el binario de poppler instalado por Homebrew en lugar del incluido en node_modules.

### Windows
En Windows, asegúrate de que Poppler esté correctamente instalado y que la carpeta `bin` esté en el PATH del sistema.

## Características

- **Interfaz Intuitiva**: Menú principal para seleccionar el tipo de documento a procesar.
- **Procesamiento Modular**: Cada tipo de documento tiene su propio módulo especializado.
- **OCR Avanzado**: Utiliza GPT-4o para extraer texto de documentos y procesarlo.
- **Manejo de Diferentes Formatos**: Soporta PDF y archivos de imagen (JPEG, PNG).
- **Manejo Robusto de Errores**: Sistema de recuperación ante errores y gestión de archivos temporales.
- **Visualización Estructurada**: Presentación de resultados en formato JSON.
- **Compatibilidad Multiplataforma**: Soporte optimizado para Windows, macOS y Linux.

## Estructura del Proyecto

```
kyc-ocr-extractor/
├── modules/
│   ├── acta-constitutiva.js    # Procesamiento de actas constitutivas
│   ├── lista-bloqueados.js     # Procesamiento de listas de personas bloqueadas
│   └── poppler-fix.js          # Solución para problemas con Poppler en macOS
├── public/
│   ├── js/
│   │   ├── acta-constitutiva.js    # Frontend para actas constitutivas
│   │   └── lista-bloqueados.js     # Frontend para listas de bloqueados
│   ├── acta-constitutiva.html  # Página para actas constitutivas
│   ├── lista-bloqueados.html   # Página para listas de bloqueados
│   ├── index.html              # Página principal
│   ├── styles.css              # Estilos CSS
│   └── script.js               # Script de redirección
├── uploads/                    # Carpeta para archivos subidos (creada automáticamente)
├── .env                        # Variables de entorno
├── server.js                   # Servidor principal
├── install-mac.sh              # Script de instalación para macOS
├── package.json                # Dependencias NPM
└── README.md                   # Este archivo
```

## Cómo Funciona

1. El usuario selecciona el tipo de documento que desea procesar
2. Sube el documento (PDF o imagen)
3. El servidor procesa el documento usando el módulo correspondiente:
   - Convierte PDF a imágenes usando Poppler
   - Procesa cada imagen con Sharp para optimizarla
   - Utiliza la API de OpenAI para extraer texto (OCR)
   - Aplica procesamiento adicional para estructurar la información
4. Devuelve los resultados estructurados en formato JSON
5. El cliente muestra los resultados de forma amigable

## Personalización

Para agregar soporte para nuevos tipos de documentos:

1. Crear un nuevo módulo en la carpeta `modules/`
2. Agregar las funciones `processOCR`, `processWithAI` y `cleanupTempFiles`
3. Actualizar `server.js` para incluir el nuevo módulo
4. Crear los archivos HTML y JS correspondientes en la carpeta `public/`
5. Actualizar `index.html` para agregar el nuevo tipo de documento al menú

## Licencia

Este proyecto está licenciado bajo [Incluir la licencia]. 