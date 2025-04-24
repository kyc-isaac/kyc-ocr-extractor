#!/bin/bash

# Script de instalación para macOS - KYC OCR Extractor
# Este script instala todas las dependencias necesarias para ejecutar la aplicación en macOS

# Colores para mensajes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Instalador para KYC OCR Extractor en macOS ===${NC}"
echo -e "${BLUE}Este script instalará todas las dependencias necesarias para ejecutar la aplicación${NC}"
echo ""

# Verificar si se está ejecutando en macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: Este script solo funciona en macOS${NC}"
    exit 1
fi

# Verificar si Homebrew está instalado
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Homebrew no está instalado. Se requiere para instalar las dependencias.${NC}"
    echo -e "${YELLOW}¿Desea instalar Homebrew? (s/n)${NC}"
    read -r instalar_homebrew
    
    if [[ "$instalar_homebrew" =~ ^[Ss]$ ]]; then
        echo -e "${GREEN}Instalando Homebrew...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Verificar si se instaló correctamente
        if ! command -v brew &> /dev/null; then
            echo -e "${RED}Error: No se pudo instalar Homebrew. Por favor, instálalo manualmente.${NC}"
            echo "Visita https://brew.sh para más instrucciones."
            exit 1
        fi
    else
        echo -e "${RED}Homebrew es necesario para instalar las dependencias. Instalación cancelada.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Homebrew está instalado. Continuando...${NC}"

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js no está instalado. Se instalará con Homebrew.${NC}"
    brew install node
    
    # Verificar si se instaló correctamente
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: No se pudo instalar Node.js. Por favor, instálalo manualmente.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Node.js ya está instalado ($(node -v)).${NC}"
fi

# Instalar o actualizar Poppler (necesario para procesar PDFs)
echo -e "${BLUE}Instalando/actualizando Poppler...${NC}"
brew install poppler || brew upgrade poppler

# Verificar si pdftocairo (parte de poppler) está disponible
if ! command -v pdftocairo &> /dev/null; then
    echo -e "${RED}Error: pdftocairo no está disponible. Hay un problema con la instalación de Poppler.${NC}"
    exit 1
else
    echo -e "${GREEN}Poppler instalado correctamente. Versión: $(pdftocairo -v 2>&1 | head -n 1)${NC}"
fi

# Instalar Cairo (dependencia requerida para Poppler)
echo -e "${BLUE}Instalando/actualizando Cairo (dependencia de Poppler)...${NC}"
brew install cairo || brew upgrade cairo

# Instalar paquetes NPM
echo -e "${BLUE}Instalando dependencias de Node.js...${NC}"
npm install

echo ""
echo -e "${GREEN}=== Instalación completada ====${NC}"
echo -e "${GREEN}Todas las dependencias necesarias han sido instaladas correctamente.${NC}"
echo -e "${BLUE}Para iniciar la aplicación ejecuta:${NC}"
echo -e "${YELLOW}npm start${NC}"
echo ""
echo -e "${BLUE}Para desarrollo (reinicio automático):${NC}"
echo -e "${YELLOW}npm run dev${NC}" 