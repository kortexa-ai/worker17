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

# Find all .conf files in the script's directory
NGINX_CONFIGS=("$SCRIPT_DIR"/*.conf)

# Check if any .conf files were found
if [ ${#NGINX_CONFIGS[@]} -eq 0 ]; then
    echo -e "${RED}Error: No .conf files found in $SCRIPT_DIR${NC}"
    exit 1
fi

# Configuration
EMAIL="admin@kortexa.ai"  # Change this to your email
NGINX_DIR="/etc/nginx"

# Function to extract all server names from Nginx config files
extract_domains() {
    local domains=()
    for config in "${NGINX_CONFIGS[@]}"; do
        # Extract server_name directives, remove ';' and 'server_name' keywords, and split into array
        while IFS= read -r line; do
            # Clean up the line and add to domains array
            cleaned=$(echo "$line" | sed -e 's/server_name//g' -e 's/;//g' -e 's/\t/ /g' -e 's/\s+/ /g' | xargs)
            if [[ -n "$cleaned" && "$cleaned" != "_" ]]; then
                domains+=($cleaned)
            fi
        done < <(grep -h '^\s*server_name\b' "$config" 2>/dev/null || true)
    done
    
    # Remove duplicates and return
    printf "%s\n" "${domains[@]}" | sort -u
}

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root${NC}"
    exit 1
fi

# Function to install certbot if not present
install_certbot() {
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}Certbot not found. Installing...${NC}"

        # Detect package manager and install certbot
        if [ -f /etc/debian_version ]; then
            snap install certbot --classic
        else
            echo -e "${RED}Unsupported Linux distribution. Please install certbot manually.${NC}"
            echo "Visit: https://certbot.eff.org/instructions"
            exit 1
        fi
    else
        echo -e "${GREEN}✓ Certbot is already installed${NC}"
    fi
}

# Function to check if nginx is running
check_nginx() {
    if ! systemctl is-active --quiet nginx; then
        echo -e "${YELLOW}Nginx is not running. Starting Nginx...${NC}"
        systemctl start nginx
        systemctl enable nginx
    fi
}

# Function to check if certificate exists for domain
certificate_exists() {
    local domain=$1
    certbot certificates 2>/dev/null | grep -q "Domains:.*$domain"
    return $?
}

# Function to obtain SSL certificate
obtain_certificate() {
    local domain=$1
    local email=$2
    local cert_opts=()
    
    echo -e "\n${YELLOW}Processing SSL certificate for $domain...${NC}"
    
    # Check if certificate already exists
    if certificate_exists "$domain"; then
        echo -e "${YELLOW}Certificate for $domain already exists. Attempting to update registration...${NC}"
        cert_opts+=(--force-renewal --email "$email")
    else
        echo -e "${YELLOW}Obtaining new certificate for $domain...${NC}"
        cert_opts+=(--email "$email")
    fi
    
    # Common certbot options
    cert_opts+=(--nginx --non-interactive --agree-tos --redirect --no-eff-email)
    
    # Run certbot
    if certbot "${cert_opts[@]}" -d "$domain"; then
        echo -e "${GREEN}✓ SSL certificate for $domain processed successfully${NC}"
    else
        echo -e "${RED}Failed to process SSL certificate for $domain${NC}"
        # Don't exit on failure for one domain if there are multiple domains
        [ ${#DOMAINS[@]} -eq 1 ] && exit 1 || return 1
    fi
}

# Function to set up auto-renewal
setup_renewal() {
    echo -e "\n${YELLOW}Setting up auto-renewal...${NC}"

    # Add a cron job to renew the certificate if it's due for renewal
    (crontab -l 2>/dev/null; echo "0 0,12 * * * root /usr/bin/certbot renew --quiet") | crontab -

    # Test renewal process
    certbot renew --dry-run

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Auto-renewal set up successfully${NC}"
    else
        echo -e "${YELLOW}Auto-renewal test failed. Please check certbot logs.${NC}"
    fi
}

# Main execution

# Extract all unique domains from Nginx configs
DOMAINS=($(extract_domains))

if [ ${#DOMAINS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No server names found in Nginx configuration files${NC}"
    exit 1
fi

echo -e "\n${GREEN}=== Found the following domains in Nginx configuration: ===${NC}"
for domain in "${DOMAINS[@]}"; do
    echo "- $domain"
done
echo ""

# Ask for confirmation
read -p "Do you want to obtain SSL certificates for these domains? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Operation cancelled${NC}"
    exit 0
fi

# Install certbot if not present
install_certbot

# Check if nginx is running
check_nginx

# Ask for email if not already set
if [ -z "$EMAIL" ]; then
    read -p "Enter email for Let's Encrypt notifications: " EMAIL
    echo
fi

# Obtain SSL certificates for all domains
for DOMAIN in "${DOMAINS[@]}"; do
    SSL_DIR="/etc/nginx/ssl/${DOMAIN}_2048"
    echo -e "\n${GREEN}=== Processing domain: $DOMAIN ===${NC}"
    obtain_certificate "$DOMAIN" "$EMAIL"
done

# Set up auto-renewal
setup_renewal

echo -e "\n${GREEN}=== SSL Setup Complete ===${NC}"
echo "Your site is now secured with Let's Encrypt!"
echo "Certificate location: $SSL_DIR"
echo -e "\n${YELLOW}Please verify your Nginx configuration and restart Nginx:"
echo "nginx -t && systemctl restart nginx${NC}"
