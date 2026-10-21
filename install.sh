#!/usr/bin/env bash
#
# Instalador do Docker Native Manager via repositório APT.
#
#   curl -fsSL https://pedrofariasx.github.io/dockernativemanager/install.sh | sudo bash
#
# O script é idempotente: rodar duas vezes apenas atualiza o que já existe.

set -euo pipefail

REPO_URL="${REPO_URL:-https://pedrofariasx.github.io/dockernativemanager}"
KEYRING="${KEYRING:-/usr/share/keyrings/dockernativemanager.gpg}"
SOURCE_LIST="${SOURCE_LIST:-/etc/apt/sources.list.d/dockernativemanager.list}"
PACKAGE="${PACKAGE:-docker-native-manager}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31mErro:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- pré-requisitos

if [ "$(id -u)" -ne 0 ]; then
  # quando executado por pipe ($0 não é um arquivo) não há como re-elevar
  if [ -f "${BASH_SOURCE[0]:-$0}" ]; then
    exec sudo -E bash "${BASH_SOURCE[0]}" "$@"
  fi
  die "este script precisa de root. Use: curl -fsSL $REPO_URL/install.sh | sudo bash"
fi

command -v apt-get >/dev/null 2>&1 \
  || die "este script é apenas para distribuições baseadas em Debian/Ubuntu."

command -v gpg >/dev/null 2>&1 || apt-get install -y --no-install-recommends gnupg \
  || die "não foi possível instalar o gnupg (necessário para validar a assinatura do repositório)."

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$1"
  else
    apt-get install -y --no-install-recommends curl >/dev/null
    curl -fsSL --retry 3 "$1"
  fi
}

# ---------------------------------------------------------------- chave e fonte

log "Instalando a chave de assinatura do repositório"
install -d -m 0755 "$(dirname "$KEYRING")"
umask 022
fetch "$REPO_URL/pubkey.asc" | gpg --dearmor --yes -o "$KEYRING"

log "Registrando o repositório APT"
if [ -f "$SOURCE_LIST" ] && grep -qF "$REPO_URL" "$SOURCE_LIST"; then
  echo "   repositório já registrado, mantendo a configuração atual"
else
  echo "deb [signed-by=$KEYRING] $REPO_URL stable main" > "$SOURCE_LIST"
  echo "   $SOURCE_LIST"
fi

# ---------------------------------------------------------------- instalação

log "Atualizando os índices do apt"
apt-get update -o Acquire::Retries=3

log "Instalando $PACKAGE"
DEBIAN_FRONTEND=noninteractive apt-get install -y "$PACKAGE"

# ---------------------------------------------------------------- próximo passo

log "Docker Native Manager instalado"
cat <<'MSG'

Para acessar o Docker local o seu usuário precisa estar no grupo "docker"
(isso não é feito automaticamente por questão de segurança):

  sudo usermod -aG docker "$USER"

Depois saia e entre novamente na sessão (ou reinicie a máquina) para valer.
Sem isso o app só consegue gerenciar contextos remotos via SSH.

MSG
