#!/bin/bash

# The requirements for this script behavior are in manage_ssl.txt
# Make sure to read them before making changes
# DO NOT DELETE THESE OR OTHER COMMENTS unless the code they refer to is deleted

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'  # Success
YELLOW='\033[1;33m' # Warning
RED='\033[0;31m'    # Error
BLUE='\033[0;34m'   # Info
PURPLE='\033[0;35m' # Header
CYAN='\033[0;36m'   # Debug
NC='\033[0m'        # No Color

# Logging functions
log_header() { echo -e "\n${PURPLE}==> $1${NC}"; }
log_info() { echo -e "${BLUE}[INFO] $1${NC}"; }
log_success() { echo -e "${GREEN}[✓] $1${NC}"; }
log_warning() { echo -e "${YELLOW}[!] $1${NC}"; }
log_error() { echo -e "${RED}[✗] ERROR: $1${NC}" >&2; }
log_debug() { [ "$DEBUG" = "true" ] && echo -e "${CYAN}[DEBUG] $1${NC}"; }

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EMAIL="admin@kortexa.ai"

# Ask for email if not provided
if [ -z "$EMAIL" ]; then
    read -p "Enter email for Let's Encrypt notifications: " EMAIL
    echo
fi

# Check if running as root
if [ "$(id -u)" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Function to check if certbot is installed
check_certbot() {
    if ! command -v certbot &>/dev/null; then
        log_error "Certbot is not installed. Please install it first."
        echo "Visit: https://certbot.eff.org/instructions"
        exit 1
    fi
}

is_certbot_managed() {
    local domain="$1"
    certbot certificates --cert-name "$domain" 2>/dev/null | grep -q 'Certificate Path:'
    return $?
}

get_certbot_cert_path() {
    local domain="$1"
    local cert_path
    cert_path=$(certbot certificates --cert-name "$domain" 2>/dev/null |
        grep 'Certificate Path:' | awk '{print $3}')
    echo "$cert_path" | sed 's/fullchain.pem//'
}

# Check if the server block is already using the correct Certbot certificate
# Implements requirement: "Check if the server block is using the cert"
is_using_certbot_cert() {
    local temp_block="$1"
    local domain="$2"
    local cert_path

    log_debug "=== Verifying certificate paths for $domain ==="

    # Get the expected Certbot cert path
    cert_path=$(get_certbot_cert_path "$domain")

    if [ -z "$cert_path" ]; then
        log_debug "❌ No Certbot certificate path found for $domain"
        return 1
    fi

    local expected_cert="${cert_path}fullchain.pem"
    local expected_key="${cert_path}privkey.pem"

    log_debug "Expected paths:"
    log_debug "  ssl_certificate: $expected_cert"
    log_debug "  ssl_certificate_key: $expected_key"

    # Get current certificate paths from the config
    local current_cert current_key
    current_cert=$(grep -oP '^\s*ssl_certificate\s+\K[^;]+' "$temp_block" | head -1 | tr -d '\n' | tr -d ' ' || true)
    current_key=$(grep -oP '^\s*ssl_certificate_key\s+\K[^;]+' "$temp_block" | head -1 | tr -d '\n' | tr -d ' ' || true)

    if [ -z "$current_cert" ] || [ -z "$current_key" ]; then
        log_debug "❌ No SSL certificate directives found in server block"
        return 1
    fi

    log_debug "Current paths in config:"
    log_debug "  ssl_certificate: $current_cert"
    log_debug "  ssl_certificate_key: $current_key"

    # Normalize paths for comparison (resolve symlinks and remove trailing slashes)
    local norm_expected_cert norm_expected_key
    local norm_current_cert norm_current_key

    norm_expected_cert=$(readlink -f "$expected_cert" 2>/dev/null || echo "$expected_cert")
    norm_expected_key=$(readlink -f "$expected_key" 2>/dev/null || echo "$expected_key")
    norm_current_cert=$(readlink -f "$current_cert" 2>/dev/null || echo "$current_cert")
    norm_current_key=$(readlink -f "$current_key" 2>/dev/null || echo "$current_key")

    log_debug "Normalized paths:"
    log_debug "  Current cert: $norm_current_cert"
    log_debug "  Expected cert: $norm_expected_cert"
    log_debug "  Current key: $norm_current_key"
    log_debug "  Expected key: $norm_expected_key"

    # Check if paths match expected Certbot paths
    if [ "$norm_current_cert" = "$norm_expected_cert" ] &&
        [ "$norm_current_key" = "$norm_expected_key" ]; then
        log_info "✓ Server block is using the correct Certbot certificate"
        log_debug "  Certificate paths match expected values"
        return 0
    fi

    log_info "Current certificate paths do not match Certbot's expected paths"
    log_info "Current cert: $current_cert"
    log_info "Expected cert: $expected_cert"
    log_info "Current key: $current_key"
    log_info "Expected key: $expected_key"
    return 1
}

process_server_block() {
    local config_file="$1"
    local server_block="$2"
    local temp_block

    # Create temp file in the same directory as the config file
    local config_dir
    config_dir=$(dirname "$config_file")
    temp_block=$(mktemp "${config_dir}/.server_block.XXXXXXXXXX")

    # Ensure we can write to the temp file
    if [ ! -w "$temp_block" ]; then
        log_error "Cannot write to temp file: $temp_block"
        return 1
    fi

    # Write server block to temp file
    echo "$server_block" >"$temp_block"
    log_debug "Created temporary server block at: $temp_block"
    log_debug "Original config file: $config_file"

    # Check if this is an HTTP or HTTPS block
    local result=0
    if grep -q 'listen\s*443' "$temp_block"; then
        log_debug "Processing HTTPS block"
        process_https_block "$config_file" "$temp_block" || result=$?
    elif grep -q 'listen\s*80' "$temp_block"; then
        log_debug "Processing HTTP block"
        process_http_block "$config_file" "$temp_block" || result=$?
    else
        log_warning "No listen directive found in server block"
        result=1
    fi

    # Clean up
    rm -f "$temp_block"
    return $result
}

# Process an HTTPS server block
# Implements requirement: "HTTPS (443) Server Blocks" section
process_https_block() {
    local config_file="$1"
    local temp_block="$2"
    local domain

    # Extract domain from server_name directive
    domain=$(grep -oP 'server_name\s+\K[^; ]+' "$temp_block" | head -1)
    if [ -z "$domain" ]; then
        log_error "Could not determine domain from server block"
        return 1
    fi

    log_header "Processing HTTPS block for domain: $domain"

    # Check if cert is already managed by certbot
    # Implements: "Check if there is a cert for the domain managed by Certbot"
    if is_certbot_managed "$domain"; then
        log_info "✓ Certificate for $domain is managed by Certbot"

        # Implements: "Check if the server block is using it"
        if is_using_certbot_cert "$temp_block" "$domain"; then
            log_info "✓ Server block is already using the correct Certbot certificate"
            return 0
        else
            # Implements: "If not, update the server block to use it"
            log_info "Updating server block to use Certbot certificate"
            if ! update_cert_paths "$temp_block" "$domain"; then
                log_error "Failed to update certificate paths for $domain"
                return 1
            fi
        fi
    else
        # Implements: "If there is not a cert for the domain managed by Certbot"
        log_warning "Certificate for $domain is not managed by Certbot"
        log_info "Attempting to obtain or renew certificate..."
        if ! issue_certificate "$domain" "$temp_block" "--force-renewal"; then
            log_error "Failed to obtain certificate for $domain"
            return 1
        fi
    fi

    # Update the config file with the changes
    log_info "Updating configuration file with changes..."
    if ! update_config_file "$config_file" "$temp_block"; then
        log_error "Failed to update configuration file"
        return 1
    fi

    log_success "Successfully processed HTTPS block for $domain"
    return 0
}

process_http_block() {
    local config_file="$1"
    local temp_block="$2"
    local domain

    # Extract domain from server_name
    domain=$(grep -oP 'server_name\s+\K[^; ]+' "$temp_block" | head -1)

    log_info "Processing HTTP block for domain: $domain"

    # Convert to HTTPS
    sed -i 's/listen\s*80/listen 443 ssl/' "$temp_block"
    sed -i 's/listen\s*\[::\]:80/listen [::]:443 ssl/' "$temp_block"

    # Issue certificate
    issue_certificate "$domain" "$temp_block"

    # Update the config file
    update_config_file "$config_file" "$temp_block"
}

issue_certificate() {
    local domain="$1"
    local temp_block="$2"
    local renew_flag="${3:-}"

    log_info "Issuing certificate for $domain"

    # Issue certificate
    if certbot certonly --webroot -w /var/www/html -d "$domain" \
        --non-interactive --agree-tos --email "$EMAIL" $renew_flag; then
        log_success "Successfully obtained certificate for $domain"
        update_cert_paths "$temp_block" "$domain"
    else
        log_error "Failed to obtain certificate for $domain"
        return 1
    fi
}

# Update certificate paths in a server block to use Certbot's paths
# Implements requirement: "Update cert paths if needed"
update_cert_paths() {
    local temp_block="$1"
    local domain="$2"
    local cert_path

    log_debug "Updating certificate paths for $domain"

    # Get certbot cert path
    cert_path=$(get_certbot_cert_path "$domain")
    if [ -z "$cert_path" ]; then
        log_error "Could not determine Certbot certificate path for $domain"
        return 1
    fi

    log_info "Using Certbot certificate path: $cert_path"

    # Create a backup of the original block for comparison
    local original_content
    original_content=$(cat "$temp_block")

    # Remove existing SSL directives
    log_debug "Removing existing SSL directives..."
    sed -i '/^\s*ssl_certificate\s/d' "$temp_block"
    sed -i '/^\s*ssl_certificate_key\s/d' "$temp_block"

    # Add new SSL certificate paths without comment
    log_debug "Adding new SSL certificate paths..."

    # Create a temporary file for the new content
    local temp_file
    temp_file=$(mktemp)

    # Process the server block to add SSL config after the server_name
    local found_server_name=0
    local added_ssl=0

    # Read the temp block and process it line by line
    while IFS= read -r line; do
        # Echo the current line to the temp file
        echo "$line" >>"$temp_file"

        # Look for server_name line to insert SSL directives after it
        if [[ $line == *server_name* ]]; then
            found_server_name=1
            # Add SSL directives right after server_name
            echo "ssl_certificate ${cert_path}fullchain.pem;" >>"$temp_file"
            echo "ssl_certificate_key ${cert_path}privkey.pem;" >>"$temp_file"
            added_ssl=1
        fi
    done <"$temp_block"

    # If we didn't find server_name, add SSL directives at the end before the closing brace
    if [ $added_ssl -eq 0 ]; then
        # Remove the last line (closing brace)
        head -n -1 "$temp_file" >"${temp_file}.tmp"
        # Add SSL directives
        echo "ssl_certificate ${cert_path}fullchain.pem;" >>"${temp_file}.tmp"
        echo "ssl_certificate_key ${cert_path}privkey.pem;" >>"${temp_file}.tmp"
        # Add back the closing brace
        echo "}" >>"${temp_file}.tmp"
        mv "${temp_file}.tmp" "$temp_file"
    fi

    # Replace the temp block with the processed content
    mv "$temp_file" "$temp_block"

    log_info "Successfully updated certificate paths in server block"
    log_debug "Updated server block content:"
    log_debug "$(cat "$temp_block" | sed 's/^/  /')"

    # Verify the changes were made
    if diff <(echo "$original_content") "$temp_block" >/dev/null; then
        log_warning "No changes were made to the server block"
        return 1
    fi

    log_info "Successfully updated certificate paths in server block"
    log_debug "Updated server block content:"
    log_debug "$(cat "$temp_block" | sed 's/^/  /')"

    return 0
}

update_config_file() {
    # Convert to absolute path if not already
    local config_file
    config_file=$(realpath "$1")
    local temp_block="$2"
    local domain
    local modified=0 # Initialize modified flag

    log_debug "Processing config file with absolute path: $config_file"

    # Extract domain for logging
    domain=$(grep -oP 'server_name\s+\K[^; ]+' "$temp_block" | head -1)
    [ -z "$domain" ] && {
        log_error "Could not determine domain from server block"
        return 1
    }

    log_header "Updating configuration for $domain"

    # Read the new block content
    local new_block_content
    new_block_content=$(cat "$temp_block")

    # Create a temporary file in the same directory as the config file
    local config_dir
    config_dir=$(dirname "$config_file")
    local temp_file
    temp_file=$(mktemp "${config_dir}/.tmp.XXXXXXXXXX")

    # Ensure we have write permissions to the config directory
    if [ ! -w "$config_dir" ]; then
        log_error "No write permission in directory: $config_dir"
        return 1
    fi

    log_debug "Created temporary file: $temp_file"
    log_debug "Will update config file: $config_file"
    log_debug "Config directory: $config_dir"
    log_debug "File exists before update: $([ -f "$config_file" ] && echo "yes" || echo "no")"
    log_debug "Directory is writable: $([ -w "$config_dir" ] && echo "yes" || echo "no")"

    # Ensure the temp file is removed if the script exits
    trap 'rm -f "$temp_file"' EXIT

    # Read the entire config file
    local config_content
    config_content=$(<"$config_file")

    # Create a new config file
    >"$temp_file"

    # Process the config file line by line to preserve formatting and comments
    local in_target_block=0
    local in_server_block=0
    local block_indent=""
    local current_block=()

    # Read the file line by line
    log_debug "Starting to process config file. Looking for domain: $domain"
    log_debug "--- Original config file ---"
    log_debug "$(cat "$config_file")"
    log_debug "----------------------------"
    log_debug ""
    log_debug "--- New server block content ---"
    log_debug "$new_block_content"
    log_debug "--------------------------------"

    local line_number=0
    while IFS= read -r line || [ -n "$line" ]; do
        line_number=$((line_number + 1))

        # Check if we're entering a server block
        if [[ $line =~ ^([[:space:]]*)server[[:space:]]*\{([^}]*)$ ]]; then
            in_server_block=1
            block_indent="${BASH_REMATCH[1]}"
            current_block=("$line")
            log_debug "Found server block start at line $line_number"
            log_debug "Block indent: '$block_indent'"

            # Start collecting the server block content
            log_debug "Started collecting server block at line $line_number"
            # Don't decide if it's the target block yet, wait until we see the server_name
            echo "$line" >>"$temp_file"
        # If we're in a server block, collect the content
        elif [ $in_server_block -eq 1 ]; then
            current_block+=("$line")
            log_debug "Added line to current server block"

            # Check if this line contains the server_name with our domain
            if [[ $line == *server_name* && $line == *$domain* ]]; then
                log_debug "Found matching server_name for domain: $domain at line $line_number"
                in_target_block=1
                log_debug "This is our target server block"
            fi

            # Check for end of server block
            if [[ $line =~ ^[[:space:]]*\}[[:space:]]*$ ]]; then
                log_debug "Found end of server block at line $line_number"
                if [ $in_target_block -eq 1 ]; then
                    log_debug "Replacing this server block with updated configuration"
                    # Remove the lines we already wrote for this block
                    head -n -${#current_block[@]} "$temp_file" >"${temp_file}.tmp"
                    mv "${temp_file}.tmp" "$temp_file"
                    # Write the new block
                    echo "${block_indent}server {" >>"$temp_file"
                    echo -e "$new_block_content" | tail -n +2 | sed "s/^/${block_indent}    /" >>"$temp_file"
                    modified=1
                    in_target_block=0
                else
                    # Not our target block, write the collected lines
                    printf '%s\n' "${current_block[@]}" >>"$temp_file"
                fi
                in_server_block=0
                current_block=()
            fi
        else
            # Outside of any server block, just output the line
            echo "$line" >>"$temp_file"
        fi
    done <"$config_file"

    # Show the final updated config
    log_debug ""
    log_debug "--- Updated config file ---"
    log_debug "$(cat "$temp_file")"
    log_debug "---------------------------"

    # If we didn't find the block to replace, log an error
    log_debug "Finished processing config file. Modified: $modified"
    if [ $modified -eq 0 ]; then
        log_error "Failed to find server block for '$domain' to update"
        log_error "Please ensure the server block contains 'server_name $domain;'"
        rm -f "$temp_file"
        return 1
    fi

    # Get original file permissions and ownership
    local orig_perms orig_owner orig_group
    orig_perms=$(stat -c "%a" "$config_file" 2>/dev/null || stat -f "%Lp" "$config_file" 2>/dev/null)
    orig_owner=$(stat -c "%U" "$config_file" 2>/dev/null || stat -f "%Su" "$config_file" 2>/dev/null)
    orig_group=$(stat -c "%G" "$config_file" 2>/dev/null || stat -f "%Sg" "$config_file" 2>/dev/null)

    # Debug: Show temp file content
    log_debug "Temporary file content:"
    log_debug "$(cat "$temp_file")"
    log_debug "----------------------------"

    # Debug: Show current config file content
    log_debug "Current config file content before update:"
    log_debug "$(cat "$config_file")"
    log_debug "----------------------------"

    # Replace the config file atomically
    log_debug "About to move $temp_file to $config_file"
    log_debug "File exists before move: $([ -f "$config_file" ] && echo "yes" || echo "no")"

    if ! mv -v "$temp_file" "$config_file"; then
        log_error "Failed to update $config_file"
        return 1
    fi

    # Debug: Show config file content after update
    log_debug "Config file content after update:"
    log_debug "$(cat "$config_file")"
    log_debug "----------------------------"

    # Verify the file was updated
    log_debug "File exists after move: $([ -f "$config_file" ] && echo "yes" || echo "no")"
    log_debug "File content after move:"
    log_debug "$(cat "$config_file" 2>&1 || echo "Failed to read file")"
    log_debug "----------------------------"

    # Restore original permissions and ownership if we got them
    if [ -n "$orig_perms" ] && [ -n "$orig_owner" ] && [ -n "$orig_group" ]; then
        log_debug "Restoring original permissions: $orig_perms and ownership: $orig_owner:$orig_group"
        chmod "$orig_perms" "$config_file"
        chown "$orig_owner:$orig_group" "$config_file"
    else
        log_warning "Could not determine original file permissions/ownership. New file may have incorrect permissions."
        # Set safe default permissions
        chmod 644 "$config_file"
        chown root:root "$config_file"
    fi

    # Test the full nginx configuration
    if ! nginx -t; then
        log_error "Nginx configuration test failed after updates"
        log_info "Run 'sudo nginx -T' to see the full configuration"
        log_info "Check the modified file: $config_file"
        return 1
    fi
}

# Process a server block within a configuration file
process_server_block() {
    local config_file="$1"
    local server_block="$2"
    local temp_block

    # Create a temporary file for this server block
    temp_block=$(mktemp)
    # Ensure the server block has proper newlines and closing brace
    local clean_block=$(echo -e "$server_block" | sed 's/^[ \t]*//')
    if [[ ! "$clean_block" =~ \}\s*$ ]]; then
        clean_block="$clean_block\n}"
    fi
    echo -e "$clean_block" >"$temp_block"

    # Determine if this is an HTTP or HTTPS block
    if grep -q 'listen\s*443' "$temp_block"; then
        log_info "Found HTTPS server block"
        if ! process_https_block "$config_file" "$temp_block"; then
            log_error "Failed to process HTTPS block"
            return 1
        fi
    elif grep -q 'listen\s*80' "$temp_block"; then
        log_info "Found HTTP server block"
        if ! process_http_block "$config_file" "$temp_block"; then
            log_error "Failed to process HTTP block"
            return 1
        fi
    else
        log_warning "Server block does not contain listen directives for port 80 or 443"
        return 0
    fi

    # If we get here, the block was processed successfully
    return 0

    # Clean up
    rm -f "$temp_block"
    return 0
}

# Validate Nginx configuration
validate_nginx_config() {
    log_info "Validating Nginx configuration..."
    if ! nginx -t &>/dev/null; then
        log_error "Nginx configuration is invalid. Please fix the configuration before proceeding."
        log_info "Run 'nginx -t' to see the specific errors."
        return 1
    fi
    log_success "Nginx configuration is valid"
    return 0
}

# Process a single Nginx configuration file
process_nginx_config_file() {
    local config_file="$1"

    log_header "Processing configuration file: $config_file"

    # Skip files starting with _
    if [[ $(basename "$config_file") = _* ]]; then
        log_info "Skipping file (starts with _)"
        return 0
    fi

    # Skip non-existent files
    if [ ! -f "$config_file" ]; then
        log_warning "File does not exist: $config_file"
        return 1
    fi

    # Extract server blocks
    local in_block=0
    local block_start=0
    local block_content=""
    local line_num=0
    local processed_blocks=0
    local temp_file
    temp_file=$(mktemp)

    # Create a temporary copy for processing
    cp "$config_file" "$temp_file"

    # Read the file line by line
    while IFS= read -r line || [ -n "$line" ]; do
        ((line_num++))

        # Check for server block start
        if [[ $line =~ ^[[:space:]]*server[[:space:]]*\{ ]]; then
            in_block=1
            block_start=$line_num
            block_content="$line"
            continue
        fi

        # If inside a server block
        if [ $in_block -eq 1 ]; then
            block_content="$block_content\n$line"

            # Check for server block end
            if [[ $line =~ ^[[:space:]]*\}[[:space:]]*$ ]]; then
                in_block=0
                ((processed_blocks++))

                # Process this server block with the original config file path
                process_server_block "$config_file" "$block_content"
                block_content=""
            fi
        fi
    done <"$config_file"

    # Clean up
    rm -f "$temp_file"

    if [ $processed_blocks -eq 0 ]; then
        log_warning "No server blocks found in $config_file"
    else
        log_success "Processed $processed_blocks server block(s) in $config_file"
    fi

    return 0
}

main() {
    log_header "=== Starting SSL Certificate Management ==="

    # Check requirements
    check_certbot

    # Validate Nginx configuration before making any changes
    if ! validate_nginx_config; then
        exit 1
    fi

    # Process configs in the script's directory
    log_info "Scanning for Nginx configuration files in $SCRIPT_DIR..."

    local processed=0
    local skipped=0
    local config_files=()

    # Find all .conf files in the script directory
    while IFS= read -r -d $'\0' config; do
        config_files+=("$config")
    done < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.conf" -not -name "_*" -print0)

    if [ ${#config_files[@]} -eq 0 ]; then
        log_warning "No configuration files found in $SCRIPT_DIR"
        return 1
    fi

    log_info "Found ${#config_files[@]} configuration file(s) to process"

    # Process each configuration file
    for config in "${config_files[@]}"; do
        log_debug "Processing file: $config"
        if process_nginx_config_file "$config"; then
            ((processed++))
        else
            ((skipped++))
        fi
    done

    # Set up auto-renewal if not exists
    if [ ! -f /etc/cron.d/certbot ]; then
        log_info "Setting up auto-renewal cron job"
        echo "0 0,12 * * * root $(which certbot) renew --quiet --deploy-hook 'systemctl reload nginx'" |
            tee /etc/cron.d/certbot >/dev/null
        chmod 0644 /etc/cron.d/certbot
        log_success "Auto-renewal cron job configured"
    else
        log_info "Auto-renewal cron job already exists"
    fi

    # Test nginx config
    log_info "Testing Nginx configuration"
    if nginx -t; then
        log_success "Nginx configuration test successful"

        # Reload nginx
        if systemctl is-active --quiet nginx; then
            log_info "Reloading Nginx..."
            systemctl reload nginx
            log_success "Nginx reloaded successfully"
        else
            log_warning "Nginx is not running. Configuration test passed but Nginx was not reloaded."
        fi
    else
        log_error "Nginx configuration test failed. Please check your configuration."
        exit 1
    fi

    log_header "=== SSL Certificate Management Complete ==="
    log_success "Processed $processed configuration file(s), skipped $skipped"
}

# Run main function
main "$@"
