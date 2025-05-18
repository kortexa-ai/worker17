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

# Main execution
echo -e "${GREEN}=== Starting SSL Certificate Management ===${NC}"

# Install certbot if not present
install_certbot

# Process each config file
echo -e "${YELLOW}Scanning for Nginx configuration files in $SCRIPT_DIR...${NC}"

find "$SCRIPT_DIR" -maxdepth 1 -name '*.conf' ! -name '_*' -type f | while read -r config_file; do
    echo -e "\n${GREEN}Processing: $(basename "$config_file")${NC}"

    # Extract domain from server_name
    domain=$(grep -oP 'server_name\s+\K[^; ]+' "$config_file" | head -1)

    if [ -z "$domain" ]; then
        echo -e "${YELLOW}No domain found in $config_file, skipping...${NC}"
        continue
    fi

    echo -e "Found domain: $domain"

    # Check if it's HTTP (port 80) or HTTPS (port 443)
    if grep -q 'listen\s*80' "$config_file"; then
        echo -e "${YELLOW}HTTP server detected, issuing new certificate...${NC}"
        if sudo certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$domain"; then
            echo -e "${GREEN}✓ Successfully issued certificate for $domain${NC}"
        else
            echo -e "${RED}Failed to issue certificate for $domain${NC}"
        fi
    elif grep -q 'listen\s*443' "$config_file"; then
        echo -e "${YELLOW}HTTPS server detected, checking certificate...${NC}"
        if certbot certificates 2>/dev/null | grep -q "Domains:.*$domain"; then
            echo -e "${GREEN}✓ Certificate for $domain is already managed by Certbot${NC}"
        else
            echo -e "${YELLOW}Certificate not managed by Certbot, renewing...${NC}"
            if sudo certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$domain"; then
                echo -e "${GREEN}✓ Successfully renewed certificate for $domain${NC}"
            else
                echo -e "${RED}Failed to renew certificate for $domain${NC}"
            fi
        fi
    fi
done

# Set up auto-renewal if not already set up
if ! crontab -l 2>/dev/null | grep -q '/usr/bin/certbot renew'; then
    echo -e "\n${YELLOW}Setting up auto-renewal...${NC}"
    (
        crontab -l 2>/dev/null
        echo "0 0,12 * * * root /usr/bin/certbot renew --quiet"
    ) | sudo crontab -

    echo -e "${YELLOW}Testing certificate renewal...${NC}"
    if sudo certbot renew --dry-run; then
        echo -e "${GREEN}✓ Auto-renewal set up successfully${NC}"
    else
        echo -e "${YELLOW}Auto-renewal test failed. Please check certbot logs.${NC}"
    fi
fi

echo -e "\n${GREEN}=== SSL Certificate Management Complete ===${NC}"
