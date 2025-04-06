# Extractor de Actas Constitutivas

Sistema web para extraer información de actas constitutivas de empresas mexicanas utilizando OCR y procesamiento de lenguaje natural.

## Características

- Interfaz web moderna y responsiva
- Procesamiento de documentos mediante OCR (Tesseract.js)
- Extracción inteligente de información mediante OpenAI GPT-4
- Soporte para archivos PDF, JPG, JPEG y PNG
- Extracción de información clave como:
  - Razón social
  - Socios y accionistas
  - Objeto social
  - Capital social
  - Representante legal
  - Y más...

## Requisitos Previos

- Node.js (v14 o superior)
- npm (v6 o superior)
- Cuenta de OpenAI con API key

## Instalación

1. Clona el repositorio:
```bash
git clone [url-del-repositorio]
cd acta-extractor
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno:
   - Copia el archivo `.env.example` a `.env`
   - Agrega tu API key de OpenAI en el archivo `.env`

4. Crea el directorio de uploads:
```bash
mkdir uploads
```

## Uso

1. Inicia el servidor:
```bash
npm start
```

2. Abre tu navegador y visita:
```
http://localhost:3000
```

3. Sube un archivo de acta constitutiva y espera los resultados.

## Estructura del Proyecto

```
acta-extractor/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── script.js
├── uploads/
├── server.js
├── package.json
├── .env
└── README.md
```

## Tecnologías Utilizadas

- Frontend: HTML, CSS, JavaScript, Bootstrap 5
- Backend: Node.js, Express
- OCR: Tesseract.js
- Procesamiento de Lenguaje: OpenAI GPT-4
- Manejo de Archivos: Multer

## Notas Importantes

- El sistema está optimizado para procesar actas constitutivas en español
- La calidad de la extracción depende de la calidad del documento escaneado
- Se recomienda usar documentos con buena resolución y contraste
- El procesamiento puede tomar algunos segundos dependiendo del tamaño del documento

## Licencia

MIT 