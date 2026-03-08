#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/fideltfg/stealthDash.git"
DEFAULT_INSTALL_DIR="$HOME/stealthDash"

log() {
  echo "[setup] $1"
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Please install Docker before running this script."
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    echo "Docker Compose is not installed. Please install Docker Compose before running this script."
    exit 1
  fi

  # Check if user can access docker socket
  if ! docker ps >/dev/null 2>&1; then
    if groups "$USER" | grep -q '\bdocker\b'; then
      echo "You are in the docker group but cannot access the socket."
      echo "Try logging out and back in."
      exit 1
    else
      echo "Adding user '$USER' to docker group..."
      sudo usermod -aG docker "$USER"
      echo ""
      echo "User added to docker group. You must log out and log back in before continuing."
      echo "After re-login, run this script again."
      exit 0
    fi
  fi

  log "Docker and Docker Compose found."
}

resolve_install_dir() {
  DASHBOARD_DIR="${STEALTHDASH_DIR:-$DEFAULT_INSTALL_DIR}"
}

fetch_repo() {
  if [[ -d "$DASHBOARD_DIR/.git" ]]; then
    log "Repository exists at $DASHBOARD_DIR. Pulling latest changes..."
    git -C "$DASHBOARD_DIR" pull --ff-only
    return
  fi

  if [[ -d "$DASHBOARD_DIR" ]] && [[ -n "$(ls -A "$DASHBOARD_DIR")" ]]; then
    echo "Install directory '$DASHBOARD_DIR' is not empty and is not a git repository."
    echo "Set STEALTHDASH_DIR to an empty path and rerun."
    exit 1
  fi

  mkdir -p "$(dirname "$DASHBOARD_DIR")"

  log "Cloning repository into $DASHBOARD_DIR..."
  rm -rf "$DASHBOARD_DIR"
  git clone "$REPO_URL" "$DASHBOARD_DIR"
}

generate_random_secret() {
  openssl rand -hex 32
}

prompt_env_values() {
  local env_file="$DASHBOARD_DIR/.env"
  local env_example="$DASHBOARD_DIR/.env.example"

  if [[ ! -f "$env_example" ]]; then
    echo "Missing $env_example"
    exit 1
  fi

  if [[ -f "$env_file" ]]; then
    log ".env already exists. Skipping configuration."
    return
  fi

  log "Configuring environment variables..."
  echo ""
  echo "Press Enter to accept defaults (shown in brackets)."
  echo ""

  local db_pass
  read -p "Database password [dashboard123]: " db_pass
  db_pass="${db_pass:-dashboard123}"

  local jwt_secret
  jwt_secret=$(generate_random_secret)
  echo "JWT Secret (auto-generated): $jwt_secret"

  local encryption_key
  encryption_key=$(generate_random_secret)
  echo "Encryption Key (auto-generated): $encryption_key"

  local dashboard_url
  read -p "Dashboard URL [http://localhost:3000]: " dashboard_url
  dashboard_url="${dashboard_url:-http://localhost:3000}"

  local smtp_host
  read -p "SMTP Host [smtp.gmail.com]: " smtp_host
  smtp_host="${smtp_host:-smtp.gmail.com}"

  local smtp_port
  read -p "SMTP Port [587]: " smtp_port
  smtp_port="${smtp_port:-587}"

  local smtp_user
  read -p "SMTP User (email) []: " smtp_user

  local smtp_pass=""
  if [[ -n "$smtp_user" ]]; then
    read -sp "SMTP Password []: " smtp_pass
    echo ""
  fi

  local email_from
  read -p "Email From Address [Dashboard <noreply@dashboard.local>]: " email_from
  email_from="${email_from:-Dashboard <noreply@dashboard.local>}"

  echo ""
  log "Creating .env file..."
  
  cat > "$env_file" <<EOF
# Database Configuration
POSTGRES_USER=dashboard
POSTGRES_PASSWORD=$db_pass
POSTGRES_DB=dashboard

# Security Keys
ENCRYPTION_KEY=$encryption_key
JWT_SECRET=$jwt_secret

# Email Configuration
SMTP_HOST=$smtp_host
SMTP_PORT=$smtp_port
SMTP_SECURE=false
SMTP_USER=$smtp_user
SMTP_PASS=$smtp_pass
EMAIL_FROM=$email_from
DASHBOARD_URL=$dashboard_url

# Vite Server Configuration
VITE_ALLOWED_HOSTS=localhost,.local
EOF

  log ".env created successfully."
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
    return
  fi

  echo ""
}

start_stack() {
  local compose
  compose="$(compose_cmd)"

  if [[ -z "$compose" ]]; then
    echo "Docker Compose was not found."
    exit 1
  fi

  log "Starting StealthDash containers..."
  (cd "$DASHBOARD_DIR" && $compose up -d --build)

  log "Waiting for services to be ready..."
  sleep 10
}

wait_for_api() {
  local max_attempts=30
  local attempt=0

  while [[ $attempt -lt $max_attempts ]]; do
    if curl -s http://localhost:3001/health >/dev/null 2>&1 || curl -s http://localhost:3001 >/dev/null 2>&1; then
      log "API is ready."
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  log "API did not respond after 60 seconds. Continuing anyway..."
  return 1
}

setup_first_user() {
  echo ""
  log "Setting up first admin user..."
  echo ""

  local username
  read -p "Username: " username
  if [[ -z "$username" ]]; then
    log "Skipping first user setup."
    return
  fi

  local email
  read -p "Email: " email
  if [[ -z "$email" ]]; then
    echo "Email is required."
    return
  fi

  local password
  read -sp "Password: " password
  echo ""

  if [[ -z "$password" ]]; then
    echo "Password is required."
    return
  fi

  wait_for_api

  log "Creating first user: $username..."

  # Hash password using ping-server container (uses bcryptjs, must match)
  local password_hash
  password_hash=$(docker exec stealth-ping-server node -e "
    const bcrypt = require('bcryptjs');
    const password = process.argv[1];
    const hash = bcrypt.hashSync(password, 10);
    console.log(hash);
  " "$password" 2>/dev/null)

  if [[ -z "$password_hash" ]]; then
    echo "ERROR: Failed to hash password."
    return 1
  fi

  # Insert user directly into database with bcrypt hash using parameterized query
  local result
  result=$(docker exec stealth-postgres psql -U dashboard -d dashboard -c "
INSERT INTO users (username, email, password_hash, is_admin, created_at, updated_at)
VALUES (E'$(echo "$username" | sed "s/'/''/g")', E'$(echo "$email" | sed "s/'/''/g")', E'$password_hash', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (username) DO NOTHING
RETURNING id, username, email;" 2>&1)

  if echo "$result" | grep -q "INSERT"; then
    log "User '$username' created and set as admin."
    return 0
  else
    echo "ERROR: Failed to create user. Response: $result"
    return 1
  fi
}

print_next_steps() {
  cat <<EOF

✓ StealthDash setup completed.

Install path: $DASHBOARD_DIR

Open: http://localhost:3000

Helpful commands:
  docker compose -f "$DASHBOARD_DIR/docker-compose.yml" ps
  docker compose -f "$DASHBOARD_DIR/docker-compose.yml" logs -f

EOF
}

main() {
  check_docker
  resolve_install_dir
  fetch_repo
  prompt_env_values
  start_stack
  setup_first_user
  print_next_steps
}

main "$@"

