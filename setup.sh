#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/fideltfg/stealthDash.git"
DEFAULT_INSTALL_DIR="$HOME/stealthDash"
DASHBOARD_SUBDIR="Dashboard"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Do not run this script as root. Run it as a normal user with sudo access."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required but not installed."
  exit 1
fi

log() {
  echo "[setup] $1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

install_base_packages() {
  log "Installing base packages (git, curl, ca-certificates, gnupg)..."
  sudo apt-get update
  sudo apt-get install -y git curl ca-certificates gnupg lsb-release
}

install_docker() {
  if need_cmd docker; then
    log "Docker is already installed."
    return
  fi

  log "Installing Docker Engine + Compose plugin..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  local codename
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

configure_docker_permissions() {
  if groups "$USER" | grep -q '\bdocker\b'; then
    log "User is already in the docker group."
    return
  fi

  log "Adding user '$USER' to docker group..."
  sudo usermod -aG docker "$USER"
  NEED_RELOGIN=1
}

resolve_install_dir() {
  if [[ -n "${STEALTHDASH_DIR:-}" ]]; then
    INSTALL_DIR="$STEALTHDASH_DIR"
  else
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  fi

  REPO_DIR="$INSTALL_DIR"
  DASHBOARD_DIR="$REPO_DIR/$DASHBOARD_SUBDIR"
}

fetch_repo() {
  mkdir -p "$INSTALL_DIR"

  if [[ -d "$REPO_DIR/.git" ]]; then
    log "Repository exists. Pulling latest changes..."
    git -C "$REPO_DIR" pull --ff-only
    return
  fi

  if [[ -d "$REPO_DIR" ]] && [[ -n "$(ls -A "$REPO_DIR")" ]]; then
    echo "Install directory '$REPO_DIR' is not empty and is not a git repository."
    echo "Set STEALTHDASH_DIR to an empty path and rerun."
    exit 1
  fi

  log "Cloning repository into $REPO_DIR..."
  rm -rf "$REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
}

bootstrap_env() {
  local env_file="$DASHBOARD_DIR/.env"
  local env_example="$DASHBOARD_DIR/.env.example"

  if [[ ! -f "$env_example" ]]; then
    echo "Missing $env_example"
    exit 1
  fi

  if [[ -f "$env_file" ]]; then
    log ".env already exists. Leaving it unchanged."
  else
    log "Creating .env from .env.example..."
    cp "$env_example" "$env_file"
  fi
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi

  if need_cmd docker-compose; then
    echo "docker-compose"
    return
  fi

  echo ""
}

start_stack() {
  local compose
  compose="$(compose_cmd)"

  if [[ -z "$compose" ]]; then
    echo "Docker Compose was not found after install."
    exit 1
  fi

  log "Starting StealthDash containers..."
  (cd "$DASHBOARD_DIR" && $compose up -d --build)
}

print_next_steps() {
  cat <<EOF

StealthDash setup completed.

Install path: $REPO_DIR
Dashboard path: $DASHBOARD_DIR

Open: http://localhost:3000

After registering your first user, make it admin with:
  cd "$DASHBOARD_DIR"
  docker exec -i stealth-postgres psql -U dashboard -d dashboard -c "UPDATE users SET is_admin = true WHERE id = 1;"

Helpful commands:
  cd "$DASHBOARD_DIR"
  docker compose ps
  docker compose logs -f

EOF

  if [[ "${NEED_RELOGIN:-0}" -eq 1 ]]; then
    cat <<'EOF'
IMPORTANT:
You were added to the docker group in this run.
Log out and log back in (or reboot) before using Docker without sudo.
If you want to continue now, run commands with sudo.
EOF
  fi
}

check_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    echo "Cannot detect OS. This script supports Ubuntu-based systems."
    exit 1
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  local id_like="${ID_LIKE:-}"
  local id="${ID:-}"

  if [[ "$id" != "ubuntu" ]] && [[ "$id_like" != *"ubuntu"* ]] && [[ "$id_like" != *"debian"* ]]; then
    echo "This setup script is intended for Ubuntu-based systems."
    exit 1
  fi
}

main() {
  check_ubuntu
  resolve_install_dir
  install_base_packages
  install_docker
  configure_docker_permissions
  fetch_repo
  bootstrap_env

  if [[ "${NEED_RELOGIN:-0}" -eq 1 ]]; then
    log "Docker group updated for user. Starting stack with sudo for this run."
    sudo -E bash -c "cd '$DASHBOARD_DIR' && docker compose up -d --build"
  else
    start_stack
  fi

  print_next_steps
}

main "$@"
