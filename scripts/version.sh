#!/bin/bash
# Script de automação de versionamento
# Autor: Pedro Farias

# Verifica se a versão foi fornecida
if [ -z "$1" ]; then
  echo "Uso: ./scripts/version.sh <nova_versão>"
  echo "Exemplo: ./scripts/version.sh 1.2.0"
  exit 1
fi

NEW_VERSION=$1

# Versão adaptada para Arch (converte hifens em underlines para ser válido no PKGBUILD)
ARCH_VERSION=$(echo "$NEW_VERSION" | tr '-' '_')

echo "Atualizando versão do projeto para: $NEW_VERSION"
echo "Versão adaptada para Arch: $ARCH_VERSION"

# 1. Atualiza o package.json
if [ -f "package.json" ]; then
  jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
  echo "✓ package.json atualizado"
fi

# 2. Atualiza o src-tauri/tauri.conf.json
if [ -f "src-tauri/tauri.conf.json" ]; then
  jq ".version = \"$NEW_VERSION\"" src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp && mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
  echo "✓ src-tauri/tauri.conf.json atualizado"
fi

# 3. Atualiza o src-tauri/Cargo.toml
if [ -f "src-tauri/Cargo.toml" ]; then
  sed -i "s/^version = \".*\"/version = \"$NEW_VERSION\"/" src-tauri/Cargo.toml
  echo "✓ src-tauri/Cargo.toml atualizado"
fi

# 4. Atualiza o PKGBUILD (se existir)
if [ -f "PKGBUILD" ]; then
  sed -i "s/^pkgver=.*/pkgver=$ARCH_VERSION/" PKGBUILD
  echo "✓ PKGBUILD atualizado (versão compatível com Arch)"
fi

echo "--------------------------------"
echo "Versão do projeto: $NEW_VERSION"
echo "Versão Arch (PKGBUILD): $ARCH_VERSION"
echo "Concluído! Versão alterada"
