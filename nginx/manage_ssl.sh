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
        if [ -f /etc/debian_version ]; then
            sudo snap install certbot --classic
        else
            echo -e "${RED}Unsupported Linux distribution. Please install certbot manually.${NC}"
            echo "Visit: https://certbot.eff.org/instructions"
            exit 1
        fi
    fi
}

# Function to check if domain is managed by certbot
is_certbot_managed() {
    local domain="$1"
    certbot certificates 2>/dev/null | grep -q "Domains:.*$domain"
    return $?
}

# Function to process a single config file
process_config() {
    local config_file="$1"
    echo -e "\n${GREEN}Processing: $(basename "$config_file")${NC}"

    # Debug: Show raw config file
    echo -e "${YELLOW}Debug - Raw config file content:${NC}"
    cat "$config_file"
    
    # Extract server_name and listen directives using awk
    echo -e "${YELLOW}Debug - Extracting server info...${NC}"
    
    # First, try to get server_name and listen in order
    servers_info=$(awk '
    /^\s*server\s*{/,/^\s*}/ {
        if ($1 == "server_name") {
            gsub(";", "", $0)
            server_name = $2
            # Look for the next listen directive
            while ((getline > 0) && !/listen/) {
                if ($1 == "server_name") {
                    gsub(";", "", $0)
                    server_name = $2
                }
            }
            if (/listen/) {
                listen = $2
                gsub(";", "", listen)
                print server_name " " listen
            }
        }
    }' "$config_file")
    
    # If that didn't work, try a simpler approach
    if [ -z "$servers_info" ]; then
        echo -e "${YELLOW}Debug - Trying alternative parsing method...${NC}"
        servers_info=$(grep -E 'server_name|listen' "$config_file" | tr '\n' ' ' | sed 's/;/;\n/g' | \
            awk '/server_name/ && /listen/ {print $2 " " $4}' | tr -d ';')
    fi
    
    echo -e "${YELLOW}Debug - Found servers:${NC}"
    echo "$servers_info"

    local updated=0

    while IFS= read -r line; do
        if [ -z "$line" ]; then continue; fi

        local domain=$(echo "$line" | awk '{print $1}')
        local port=$(echo "$line" | awk '{print $2}')

        echo -e "\n${YELLOW}Found server: $domain (port $port)${NC}"

        # Process based on port
        if [ "$port" = "443" ]; then
            if is_certbot_managed "$domain"; then
                echo -e "${GREEN}✓ Certificate for $domain is already managed by Certbot${NC}"
            else
                echo -e "${YELLOW}Certificate for $domain is not managed by Certbot. Renewing...${NC}"
                if sudo certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$domain"; then
                    echo -e "${GREEN}✓ Successfully renewed certificate for $domain${NC}"
                    updated=1
                else
                    echo -e "${RED}Failed to renew certificate for $domain${NC}"
                fi
            fi
        elif [ "$port" = "80" ]; then
            echo -e "${YELLOW}Issuing new certificate for $domain...${NC}"
            if sudo certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$domain"; then
                echo -e "${GREEN}✓ Successfully issued certificate for $domain${NC}"
                updated=1
            else
                echo -e "${RED}Failed to issue certificate for $domain${NC}"
            fi
        fi
    done <<<"$servers_info"

    if [ "$updated" = "1" ]; then
        echo -e "\n${YELLOW}Configuration was updated. Testing Nginx config...${NC}"
        if ! sudo nginx -t; then
            echo -e "${RED}Error in Nginx configuration. Please check the config file.${NC}"
            return 1
        fi

        echo -e "${GREEN}Reloading Nginx to apply changes...${NC}"
        sudo systemctl reload nginx
    fi
}

# Main execution
echo -e "${GREEN}=== Starting SSL Certificate Management ===${NC}"

# Install certbot if not present
install_certbot

# Process each config file
echo -e "${YELLOW}Scanning for Nginx configuration files in $SCRIPT_DIR...${NC}"
echo -e "${YELLOW}Found config files:${NC}"
find "$SCRIPT_DIR" -maxdepth 1 -name '*.conf' ! -name '_*' -type f -ls
find "$SCRIPT_DIR" -maxdepth 1 -name '*.conf' ! -name '_*' -type f | while read -r config_file; do
    process_config "$config_file"
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
