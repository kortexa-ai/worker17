#!/bin/bash

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL="admin@kortexa.ai"

# Ask for email if not provided
if [ -z "$EMAIL" ]; then
    read -p "Enter email for Let's Encrypt notifications: " EMAIL
    echo
fi

# Function to install certbot if not present
install_certbot() {
    if ! command -v certbot &>/dev/null; then
        echo -e "${YELLOW}Certbot not found. Installing...${NC}"

        # Detect package manager and install certbot
        # use snap to install certbot on ubuntu, don't use apt
        # no other systems supported for now
        if [ -f /etc/debian_version ]; then
            sudo snap install certbot --classic
        else
            echo -e "${RED}Unsupported Linux distribution. Please install certbot manually.${NC}"
            echo "Visit: https://certbot.eff.org/instructions"
            exit 1
        fi
    fi
}

has_valid_cert() {
    certbot certificates --cert-name "$1" 2>/dev/null | grep -q 'VALID: 3' || return 1
    return 0
}

update_nginx_config() {
    local config_file="$1"
    local domain="$2"

    echo -e "${YELLOW}Processing: $config_file (domain: $domain)${NC}"

    # Check if this is an HTTP or HTTPS server block
    if grep -q "listen\s*443" "$config_file"; then
        # Update existing HTTPS config
        echo -e "${YELLOW}Updating HTTPS config${NC}"

        # Ensure cert exists
        if ! has_valid_cert "$domain"; then
            echo -e "${YELLOW}Getting certificate...${NC}"
            certbot certonly --webroot -w /var/www/html -d "$domain" --non-interactive --agree-tos --email "$EMAIL" || return 1
        fi

        # Remove existing SSL directives if any
        sudo sed -i -e '/ssl_certificate/d' -e '/ssl_certificate_key/d' -e '/listen.*ssl/d' "$config_file"

        # Add listen directives before server_name
        sudo sed -i "/^\s*server_name/i \    listen 443 ssl;" "$config_file"
        sudo sed -i "/^\s*server_name/i \    listen [::]:443 ssl;" "$config_file"

        # Add SSL directives after server_name
        sudo sed -i "/^\s*server_name/a \    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;" "$config_file"
        sudo sed -i "/^\s*server_name/a \    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;" "$config_file"

    elif grep -q "listen\s*80" "$config_file"; then
        # Convert HTTP to HTTPS
        echo -e "${YELLOW}Converting HTTP to HTTPS${NC}"

        # Get certificate
        if ! has_valid_cert "$domain"; then
            echo -e "${YELLOW}Getting certificate...${NC}"
            certbot certonly --webroot -w /var/www/html -d "$domain" --non-interactive --agree-tos --email "$EMAIL" || return 1
        fi

        # Remove existing SSL directives if any
        sudo sed -i -e '/ssl_certificate/d' -e '/ssl_certificate_key/d' -e '/listen.*ssl/d' "$config_file"

        # Update ports (80 → 443 ssl)
        sudo sed -i -e 's/listen\s*80/listen 443 ssl/' \
                   -e 's/listen\s*\[::\]:80/listen [::]:443 ssl/' "$config_file"

        # Add SSL directives after server_name
        sudo sed -i "/^\s*server_name/a \    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;" "$config_file"
        sudo sed -i "/^\s*server_name/a \    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;" "$config_file"
    else
        echo -e "${YELLOW}No HTTP/HTTPS server block found, skipping${NC}"
        return 0
    fi

    # Test and reload Nginx if running
    if nginx -t; then
        if systemctl is-active --quiet nginx; then
            systemctl reload nginx
            echo -e "${GREEN}✓ Nginx reloaded${NC}"
        else
            echo -e "${YELLOW}Nginx is not running. Config test passed but not reloaded.${NC}"
        fi
    else
        echo -e "${RED}Nginx config test failed${NC}"
        return 1
    fi
}

process_nginx_config() {
    local config_file="$1"
    local domain

    # Extract first non-localhost domain
    domain=$(grep -oP 'server_name\s+\K[^; ]+' "$config_file" | grep -v '^_\|localhost\|127.\|\[' | head -1)
    [ -z "$domain" ] && return 0

    update_nginx_config "$config_file" "$domain"
}

# Main execution
echo -e "${GREEN}=== Starting SSL Certificate Management ===${NC}"


# Check root
[ "$EUID" -ne 0 ] && { echo -e "${RED}Run with sudo${NC}"; exit 1; }

install_certbot

# Create well-known directory if it doesn't exist
if [ ! -d /var/www/html/.well-known/acme-challenge ]; then
    mkdir -p /var/www/html/.well-known/acme-challenge
    chown -R www-data:www-data /var/www/html/.well-known
fi

# Process configs
# Process each config file
echo -e "${YELLOW}Scanning for Nginx configuration files in $SCRIPT_DIR...${NC}"

find "$SCRIPT_DIR" -maxdepth 1 -name '*.conf' ! -name '_*' -type f | while read -r f; do
    process_nginx_config "$f"
done

# Set up auto-renewal if not exists
[ -f /etc/cron.d/certbot ] || {
    echo "0 0,12 * * * root $(which certbot) renew --quiet --deploy-hook 'systemctl reload nginx'" \
        | sudo tee /etc/cron.d/certbot > /dev/null
    echo -e "${GREEN}✓ Auto-renewal set up${NC}"
}
