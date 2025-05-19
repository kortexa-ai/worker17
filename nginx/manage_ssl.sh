#!/bin/bash

# The requirements for this script behavior are in manage_ssl.txt
# Make sure to read them before making changes
# Pay extra attention to the implementation requirements section at the end of that file
# DO NOT DELETE THESE OR OTHER COMMENTS unless the code they refer to is deleted

# Exit on error, treat unset variables as an error, and propagate pipeline failures
set -euo pipefail

# --- Configuration & Global Variables ---
EMAIL="${LETSENCRYPT_EMAIL:-admin@kortexa.ai}" # Email for Let's Encrypt notifications (SET THIS EXTERNALLY for safety, or here for default)
DEBUG=${DEBUG:-false}                          # Enable debug logging by setting DEBUG=true
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LE_BASE_DIR="${TEST_LE_BASE_DIR:-/etc/letsencrypt}" # Base directory for Let's Encrypt files
NGINX_CONFIG_FILES=()                               # Array to hold discovered Nginx config files
NEEDS_NGINX_RELOAD=false                            # Flag to track if Nginx needs reload
NEEDS_NGINX_RESTART_AFTER_STANDALONE=false          # Flag to track if Nginx was stopped for Certbot standalone

# --- Colors for Output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Logging Functions (now to stderr) ---
log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_debug() { [ "$DEBUG" = true ] && echo -e "${CYAN}[DEBUG]${NC} $1" >&2; }
log_header() { echo -e "\n${PURPLE}--- $1 ---${NC}" >&2; }

# --- Nginx Helper Functions ---
check_nginx_config() {
    log_info "Checking Nginx configuration..."
    if command -v nginx &>/dev/null; then
        # Use sudo for nginx -t as it might need to read protected files
        if sudo nginx -t; then
            log_success "Nginx configuration is valid."
        else
            log_error "Nginx configuration test failed. Please fix errors before proceeding."
            exit 1
        fi
    else
        log_warning "nginx command not found. Skipping Nginx configuration test."
    fi
}

find_nginx_configs() {
    log_header "Locating Nginx Configuration Files"
    # NGINX_CONFIG_FILES is a global array, initialized in the Global Variables section

    local search_path

    log_info "Searching for .conf files in $PWD (excluding files starting with '_')..."
    search_path="$PWD"
    for file in "$search_path"/*.conf; do
        # Handle cases where glob doesn't find any files and returns the pattern itself
        if [ -e "$file" ] && [ -f "$file" ]; then
            if [[ "$(basename "$file")" != _* ]]; then
                log_debug "Found config file: $file in $PWD"
                NGINX_CONFIG_FILES+=("$file")
            else
                log_debug "Skipping config file starting with underscore: $file in $PWD"
            fi
        fi
    done

    if [ ${#NGINX_CONFIG_FILES[@]} -gt 0 ]; then
        log_info "Found ${#NGINX_CONFIG_FILES[@]} config file(s) in $PWD."
    else
        log_info "No suitable .conf files found in $PWD. Searching in $SCRIPT_DIR (excluding files starting with '_')..."
        search_path="$SCRIPT_DIR"
        for file in "$search_path"/*.conf; do
            if [ -e "$file" ] && [ -f "$file" ]; then
                if [[ "$(basename "$file")" != _* ]]; then
                    log_debug "Found config file: $file in $SCRIPT_DIR"
                    NGINX_CONFIG_FILES+=("$file")
                else
                    log_debug "Skipping config file starting with underscore: $file in $SCRIPT_DIR"
                fi
            fi
        done

        if [ ${#NGINX_CONFIG_FILES[@]} -gt 0 ]; then
            log_info "Found ${#NGINX_CONFIG_FILES[@]} config file(s) in $SCRIPT_DIR."
        fi
    fi

    if [ ${#NGINX_CONFIG_FILES[@]} -eq 0 ]; then
        log_warning "No Nginx .conf files found in $PWD or $SCRIPT_DIR that do not start with '_'. Nothing to do."
        # Exit with 0 as per requirements, nothing to process.
        exit 0
    fi

    log_info "Will process the following ${#NGINX_CONFIG_FILES[@]} configuration file(s):"
    for conf_file in "${NGINX_CONFIG_FILES[@]}"; do
        log_info "  - $conf_file"
    done
}

stop_nginx_service_if_running() {
    log_info "Checking Nginx status before Certbot standalone..."
    if sudo systemctl is-active --quiet nginx; then
        log_info "Nginx is running. Attempting to stop Nginx for Certbot standalone..."
        if sudo systemctl stop nginx; then
            log_success "Nginx stopped successfully."
            NEEDS_NGINX_RESTART_AFTER_STANDALONE=true
        else
            log_error "Failed to stop Nginx. Certbot standalone cannot proceed safely."
            # Exit or handle error appropriately. For now, script will exit due to set -e if sudo systemctl stop fails.
            # If we want to attempt to continue with other domains, more complex error handling is needed here.
            exit 1 # Explicitly exit on failure to stop nginx
        fi
    else
        log_info "Nginx is not currently running or 'systemctl' indicated so."
        # Ensure flag is false if Nginx wasn't running to begin with
        NEEDS_NGINX_RESTART_AFTER_STANDALONE=false
    fi
}

start_nginx_service_if_needed() {
    if [ "$NEEDS_NGINX_RESTART_AFTER_STANDALONE" = true ]; then
        log_info "Attempting to start Nginx after Certbot standalone operation..."
        if sudo systemctl start nginx; then
            log_success "Nginx started successfully."
            NEEDS_NGINX_RESTART_AFTER_STANDALONE=false
            # sleep 2 # Consider if needed for service to fully stabilize before a reload
        else
            log_error "Failed to start Nginx. Manual intervention may be required."
            # Script will exit due to set -e if start fails.
        fi
    fi
}

reload_nginx_service() {
    if [ "$NEEDS_NGINX_RELOAD" = true ]; then
        log_header "Reloading Nginx Service"
        log_info "Changes were made that require an Nginx reload."
        check_nginx_config # Ensure config is still valid
        log_info "Attempting to reload Nginx using 'sudo systemctl reload nginx'..."
        if sudo systemctl reload nginx; then
            log_success "Nginx reloaded successfully."
        else
            log_error "Failed to reload Nginx. 'sudo systemctl reload nginx' failed. Manual intervention may be required."
            exit 1 # Exit if reload fails, as config might be in an inconsistent state with running Nginx
        fi
    else
        log_info "No changes requiring Nginx reload."
    fi
}

# --- Server Block Parsing Utilities ---
get_directive_value() {
    local directive_name="$1"
    local block_content="$2"
    local value=""

    # Read block content line by line
    while IFS= read -r line; do
        # Remove leading/trailing whitespace from the line
        local trimmed_line="${line#"${line%%[![:space:]]*}"}"
        trimmed_line="${trimmed_line%"${trimmed_line##*[![:space:]]}"}"

        # Check if the line starts with the directive name followed by a space
        if [[ "$trimmed_line" == "$directive_name "* ]]; then
            # Extract the value part (everything after the directive name and a space)
            value="${trimmed_line#$directive_name }"
            # Remove trailing semicolon if present
            value="${value%;}"
            # Remove leading/trailing whitespace from the value itself
            value="${value#"${value%%[![:space:]]*}"}"
            value="${value%"${value##*[![:space:]]}"}"
            # Return the first occurrence
            echo "$value"
            return
        fi
    done <<<"$(echo -e "$block_content")" # Use echo -e to handle potential escaped newlines in block_content
    echo ""                               # Return empty if not found
}

get_server_names_from_block() {
    local block_content="$1"
    # server_name can have multiple names, space-separated. We'll return the whole line.
    get_directive_value "server_name" "$block_content"
}

get_listen_directives_from_block() {
    local block_content="$1"
    local listen_directives=()
    while IFS= read -r line; do
        local trimmed_line="${line#"${line%%[![:space:]]*}"}"
        trimmed_line="${trimmed_line%"${trimmed_line##*[![:space:]]}"}"
        if [[ "$trimmed_line" == "listen "* ]]; then
            listen_directives+=("${trimmed_line#listen }") # Add value part
        fi
    done <<<"$(echo -e "$block_content")"
    # Return as a space-separated string of directives values
    echo "${listen_directives[@]}"
}

# --- Server Block Modification Utilities ---
modify_directive_in_line() {
    local line_content="$1"
    local directive_key="$2" # e.g., "ssl_certificate"
    local new_value="$3"     # e.g., "/etc/letsencrypt/live/domain.com/fullchain.pem"

    local leading_whitespace=""
    leading_whitespace="${line_content%%[![:space:]]*}" # Get leading whitespace

    local trimmed_line="${line_content#"$leading_whitespace"}" # Line without leading whitespace

    if [[ "$trimmed_line" == "$directive_key "* ]]; then
        echo "${leading_whitespace}${directive_key} ${new_value};"
    else
        echo "$line_content" # Return original if not the directive we're looking for
    fi
}

# --- Certbot Helper Functions ---
get_certbot_cert_path() {
    local domain_name="$1"
    echo "$LE_BASE_DIR/live/$domain_name/fullchain.pem"
}

get_certbot_key_path() {
    local domain_name="$1"
    echo "$LE_BASE_DIR/live/$domain_name/privkey.pem"
}

issue_certificate_with_certbot() {
    local domain_name="$1"
    log_info "Attempting to issue/renew certificate for $domain_name using Certbot in standalone mode."

    if [ -z "$domain_name" ]; then
        log_error "Domain name cannot be empty for issuing certificate."
        return 1 # Failure
    fi

    stop_nginx_service_if_running

    log_info "Executing Certbot command for $domain_name:"
    # Add --staging for testing to avoid hitting Let's Encrypt rate limits
    # local certbot_cmd="sudo certbot certonly --standalone --staging -d $domain_name --email $EMAIL --agree-tos --no-eff-email --keep-until-expiring --expand --non-interactive --staple-ocsp --uir"
    local certbot_cmd="sudo certbot certonly --standalone -d $domain_name --email $EMAIL --agree-tos --no-eff-email --keep-until-expiring --expand --non-interactive --staple-ocsp --uir"
    log_info "  Running: $certbot_cmd"

    # Execute the command, redirecting its stdout and stderr to this script's stderr
    if eval "$certbot_cmd" >&2; then # Using eval to handle potential spaces/quotes in variables if they existed, though here it's simple.
        log_success "Certbot successfully obtained/renewed certificate for $domain_name."
        log_info "Certbot typically sets up auto-renewal for issued certificates automatically."
        NEEDS_NGINX_RELOAD=true       # Config will change to use new cert
        start_nginx_service_if_needed # Start Nginx *after* certbot is done
        return 0                      # Success
    else
        log_error "Certbot failed to obtain/renew certificate for $domain_name. Exit status: $?"
        start_nginx_service_if_needed # Ensure Nginx is started even if Certbot fails
        return 1                      # Failure
    fi
}

is_certbot_certificate_available() {
    local domain_name="$1"
    local cert_path
    cert_path=$(get_certbot_cert_path "$domain_name")

    if [ -f "$cert_path" ]; then
        log_debug "Certbot certificate found for $domain_name at $cert_path"
        return 0 # Bash success (true)
    else
        log_debug "No Certbot certificate found for $domain_name at $cert_path"
        return 1 # Bash failure (false)
    fi
}

# --- Core Processing Functions ---
process_server_block() {
    local original_block_content="$1" # Changed name to avoid confusion
    local config_file="$2"
    local block_number="$3"
    log_info "Processing server block #$block_number from $config_file" >&2

    # --- BEGIN DEBUG for process_server_block INPUT ---
    log_debug "-- PSB_INPUT (Block #$block_number) from $config_file -- Length: ${#original_block_content}" >&2
    # Using printf to stderr for potentially multi-line content
    if [ ${#original_block_content} -gt 0 ]; then
        printf "PSB_INPUT Content BEGINS:\n%s\nPSB_INPUT Content ENDS\n" "$original_block_content" >&2
    else
        log_debug "PSB_INPUT Content is EMPTY" >&2
    fi
    log_debug "-- END PSB_INPUT (Block #$block_number) --" >&2
    # --- END DEBUG ---

    local current_block_content="$original_block_content" # Work on a copy that might be modified
    local block_was_modified=false

    local server_names_line
    local primary_server_name=""
    local listen_directives_str
    local listen_options=()
    local is_ssl=false
    local is_http=false  # Specifically for port 80 without ssl
    local is_https=false # Specifically for port 443 with ssl

    server_names_line=$(get_server_names_from_block "$current_block_content")
    if [ -n "$server_names_line" ]; then
        # Take the first name as the primary. Handles single and multiple space-separated names.
        primary_server_name="${server_names_line%% *}"
        log_debug "  Server Names: $server_names_line (Primary: $primary_server_name)"
    else
        log_warning "  No server_name directive found in block #$block_number of $config_file. Skipping Certbot checks for this block."
        # If no server_name, we cannot proceed with Certbot logic for this block.
        # Further processing of this block (if any non-domain specific tasks existed) could continue,
        # but for Certbot, it's a no-go.
    fi

    listen_directives_str=$(get_listen_directives_from_block "$current_block_content")
    # Convert space-separated string into an array
    # Use a loop to handle directives with spaces like '443 ssl http2'
    local old_ifs="$IFS"
    IFS=$'\n' # Split by newline, as get_listen_directives_from_block returns space separated full listen lines
    # We need to re-parse the output of get_listen_directives_from_block as it's a flat string
    local temp_listen_array=()
    while IFS= read -r line; do # Read from the original block content again for listen lines
        local trimmed_listen_line="${line#"${line%%[![:space:]]*}"}"
        trimmed_listen_line="${trimmed_listen_line%"${trimmed_listen_line##*[![:space:]]}"}"
        if [[ "$trimmed_listen_line" == "listen "* ]]; then
            temp_listen_array+=("${trimmed_listen_line#listen }")
        fi
    done <<<"$(echo -e "$current_block_content")"
    IFS="$old_ifs"

    if [ ${#temp_listen_array[@]} -eq 0 ]; then
        log_warning "  No listen directives found in block #$block_number of $config_file."
    else
        log_debug "  Raw Listen Directives: ${temp_listen_array[*]}"
        for listen_value in "${temp_listen_array[@]}"; do
            listen_options+=("$listen_value") # Store the full value part of the listen directive
            if [[ "$listen_value" == *"443 ssl"* || "$listen_value" == *"ssl"* && "$listen_value" == *"443"* ]]; then
                is_https=true
                is_ssl=true # General ssl flag
            elif [[ "$listen_value" == "80" || "$listen_value" == "[::]:80" ]]; then
                # Only set is_http if it's specifically port 80 and not SSL
                # A block can listen on 80 and 443, is_https takes precedence for cert logic
                if ! [[ "$listen_value" == *"ssl"* ]]; then # Check it's not 'listen 80 ssl;'
                    is_http=true
                fi
            fi
            # The requirement mentioned IPv4 and IPv6, e.g. `listen 80; listen [::]:80;`
            # and `listen 443 ssl; listen [::]:443 ssl;`
            # The logic above should catch these via the port numbers and 'ssl' keyword.
        done
    fi

    log_debug "  Extracted Listen Options: ${listen_options[*]}"

    if $is_https; then
        log_info "  Block #$block_number (Server: ${primary_server_name:-N/A}) is an HTTPS block."
        local current_cert_path=$(get_directive_value "ssl_certificate" "$current_block_content")
        local current_key_path=$(get_directive_value "ssl_certificate_key" "$current_block_content")
        log_debug "    Current SSL Certificate: ${current_cert_path:-Not set}"
        log_debug "    Current SSL Key: ${current_key_path:-Not set}"

        if [ -z "$primary_server_name" ]; then
            log_warning "    Cannot check/update Certbot status without a primary server name."
        else
            local expected_cert_path=$(get_certbot_cert_path "$primary_server_name")
            local expected_key_path=$(get_certbot_key_path "$primary_server_name")

            if is_certbot_certificate_available "$primary_server_name"; then
                log_info "    Certbot certificate IS available for $primary_server_name."
                if [ "$current_cert_path" == "$expected_cert_path" ] && [ "$current_key_path" == "$expected_key_path" ]; then
                    log_success "    Block is ALREADY using Certbot's certificate for $primary_server_name."
                else
                    log_warning "    Block is NOT using Certbot's live certificate for $primary_server_name."
                    log_info "    UPDATING block to use Certbot's certificate for $primary_server_name."

                    local new_lines=()
                    local line_processed
                    while IFS= read -r line_processed; do
                        line_processed=$(modify_directive_in_line "$line_processed" "ssl_certificate" "$expected_cert_path")
                        line_processed=$(modify_directive_in_line "$line_processed" "ssl_certificate_key" "$expected_key_path")
                        new_lines+=("$line_processed")
                    done <<<"$(echo -e "$current_block_content")"
                    current_block_content=$(printf '%s\n' "${new_lines[@]}")
                    block_was_modified=true
                fi
            else
                log_warning "    Certbot certificate IS NOT available for $primary_server_name."
                if [ -n "$primary_server_name" ]; then
                    log_info "    Attempting to issue a new certificate for $primary_server_name..."
                    if issue_certificate_with_certbot "$primary_server_name"; then
                        log_info "    UPDATING block to use newly issued Certbot certificate for $primary_server_name."
                        local new_lines=()
                        local line_processed
                        while IFS= read -r line_processed; do
                            line_processed=$(modify_directive_in_line "$line_processed" "ssl_certificate" "$expected_cert_path") # Certbot paths are standard
                            line_processed=$(modify_directive_in_line "$line_processed" "ssl_certificate_key" "$expected_key_path")
                            new_lines+=("$line_processed")
                        done <<<"$(echo -e "$current_block_content")"
                        current_block_content=$(printf '%s\n' "${new_lines[@]}")
                        block_was_modified=true
                    else
                        log_error "    Failed to issue certificate for $primary_server_name. Block will not be updated."
                    fi
                fi
            fi
        fi
    elif $is_http && ! $is_ssl; then
        log_info "  Block #$block_number (Server: ${primary_server_name:-N/A}) is an HTTP block."
        if [ -n "$primary_server_name" ]; then
            log_info "    Attempting to issue a new certificate for $primary_server_name to convert to HTTPS..."
            if issue_certificate_with_certbot "$primary_server_name"; then
                log_info "    CONVERTING HTTP block to HTTPS for $primary_server_name."
                local new_cert_path=$(get_certbot_cert_path "$primary_server_name")
                local new_key_path=$(get_certbot_key_path "$primary_server_name")

                local new_lines=()
                local line_processed
                local listen_directives_added=false

                while IFS= read -r line_processed; do
                    local leading_whitespace="${line_processed%%[![:space:]]*}"
                    local trimmed_line="${line_processed#"$leading_whitespace"}"

                    if [[ "$trimmed_line" == "listen "*"80"* && "$trimmed_line" != *"ssl"* ]]; then
                        if ! $listen_directives_added; then # Add new listen/ssl directives once
                            new_lines+=("${leading_whitespace}listen 443 ssl;")
                            new_lines+=("${leading_whitespace}listen [::]:443 ssl;")
                            new_lines+=("${leading_whitespace}ssl_certificate $new_cert_path;")
                            new_lines+=("${leading_whitespace}ssl_certificate_key $new_key_path;")
                            listen_directives_added=true
                        fi
                        # Skip adding the original http listen line
                    else
                        new_lines+=("$line_processed")
                    fi
                done <<<"$(echo -e "$current_block_content")"
                current_block_content=$(printf '%s\n' "${new_lines[@]}")
                block_was_modified=true
            else
                log_error "    Failed to issue certificate for $primary_server_name. Block will not be converted."
            fi
        fi
    else
        log_debug "  Block #$block_number (Server: ${primary_server_name:-N/A}) is neither standard HTTP nor HTTPS, or unhandled. No changes made."
        if $is_ssl; then
            log_warning "  Block #$block_number (Server: ${primary_server_name:-N/A}) has 'ssl' but is not a standard HTTPS (443) block. Listen options: ${listen_options[*]}"
        else
            log_warning "  Block #$block_number (Server: ${primary_server_name:-N/A}) is neither a standard HTTP nor HTTPS block. Listen options: ${listen_options[*]}"
        fi
    fi

    # --- BEGIN DEBUG for process_server_block OUTPUT ---
    log_debug "-- PSB_OUTPUT (Block #$block_number) from $config_file -- Length: ${#current_block_content}" >&2
    # Using printf to stderr for potentially multi-line content
    if [ ${#current_block_content} -gt 0 ]; then
        printf "PSB_OUTPUT Content BEGINS:\n%s\nPSB_OUTPUT Content ENDS\n" "$current_block_content" >&2
    else
        log_debug "PSB_OUTPUT Content is EMPTY" >&2
    fi
    log_debug "-- END PSB_OUTPUT (Block #$block_number) --" >&2
    # --- END DEBUG ---

    # If block_was_modified is true (set by sub-functions like update_ssl_paths_in_block or convert_http_to_https)
    # log this information. The actual NEEDS_NGINX_RELOAD will be set by the caller if content differs.
    if $block_was_modified; then
        log_info "  PSB_INFO: Semantic modifications were flagged by process_server_block for block #$block_number in $config_file." >&2
    fi

    echo "$current_block_content" # Output the (potentially modified) block content using echo
    return 0                      # Default return for successfully processed block (no error)
}

process_config_file() {
    local config_file_path="$1" # Renamed for clarity, this is the $config_file from your snippet
    log_info "Starting to process Nginx config file: $config_file_path" >&2

    local original_line
    local in_server_block=false
    local current_block_lines_for_processing=()
    local brace_level=0
    local server_block_counter=0
    local new_file_content=""
    local file_was_changed=false

    # Read file line by line, robustly handling last line without newline
    while IFS= read -r original_line || [ -n "$original_line" ]; do
        local line_for_stripping="$original_line"
        local stripped_line="$line_for_stripping"
        if [[ "$stripped_line" == *"#"* ]]; then stripped_line="${stripped_line%%#*}"; fi
        stripped_line="${stripped_line#"${stripped_line%%[![:space:]]*}"}"
        stripped_line="${stripped_line%"${stripped_line##*[![:space:]]}"}"

        if ! $in_server_block && [[ "$stripped_line" == "server {" ]]; then
            in_server_block=true
            brace_level=1
            current_block_lines_for_processing=("$original_line")
            continue
        fi

        if $in_server_block; then
            current_block_lines_for_processing+=("$original_line")

            local open_braces_in_line=0
            local close_braces_in_line=0
            local temp_stripped_line_for_braces="$stripped_line"
            local count_tempO="$temp_stripped_line_for_braces"
            while [[ "$count_tempO" == *"{"* ]]; do
                open_braces_in_line=$((open_braces_in_line + 1))
                count_tempO="${count_tempO/*\{/}"
            done
            local count_tempC="$temp_stripped_line_for_braces"
            while [[ "$count_tempC" == *"}"* ]]; do
                close_braces_in_line=$((close_braces_in_line + 1))
                count_tempC="${count_tempC/*\}/}"
            done
            brace_level=$((brace_level + open_braces_in_line - close_braces_in_line))

            if [[ $brace_level -eq 0 ]]; then
                server_block_counter=$((server_block_counter + 1))
                local current_block_content_str
                current_block_content_str=$(printf '%s\n' "${current_block_lines_for_processing[@]}")

                log_debug "PCF: Preparing to call process_server_block for block #$server_block_counter. Current new_file_content length: ${#new_file_content}" >&2
                local processed_block_content
                processed_block_content=$(process_server_block "$current_block_content_str" "$config_file_path" "$server_block_counter")
                local process_exit_code=$?

                log_debug "PCF: ----- BEGIN DIAGNOSTICS for Block #$server_block_counter -----" >&2
                log_debug "PCF: process_server_block exit code: $process_exit_code" >&2
                log_debug "PCF: Captured processed_block_content length: ${#processed_block_content}" >&2
                if [ ${#processed_block_content} -gt 0 ]; then
                    printf "PCF: Captured processed_block_content BEGINS:\n%s\nPCF: Captured processed_block_content ENDS\n" "$processed_block_content" >&2
                else
                    log_debug "PCF: Captured processed_block_content is EMPTY" >&2
                fi

                local prev_new_file_content_length=${#new_file_content}

                if [ "$process_exit_code" -ne 0 ]; then
                    log_error "  PCF: Error processing server block #$server_block_counter (exit code $process_exit_code). Appending original raw block." >&2
                    new_file_content+="$current_block_content_str"
                else
                    log_debug "  PCF: Successfully processed server block #$server_block_counter. Appending processed content." >&2
                    new_file_content+="$processed_block_content"
                    new_file_content+=$'\n' # Add an extra newline for separation after the block

                    # Check if the textual content actually changed to set file_was_changed flag
                    if [[ "$processed_block_content" != "$current_block_content_str" ]]; then
                        log_info "  PCF: Textual change detected for block #$server_block_counter. Marking file_was_changed=true and NEEDS_NGINX_RELOAD=true." >&2
                        file_was_changed=true
                        NEEDS_NGINX_RELOAD=true # Set reload flag here, in the correct scope
                    fi
                fi
                log_debug "PCF: new_file_content length: Before append: $prev_new_file_content_length, After append: ${#new_file_content}" >&2
                if [ "$process_exit_code" -eq 0 ] && [ "${#processed_block_content}" -gt 0 ] && [ "${#new_file_content}" -le "$prev_new_file_content_length" ]; then
                    log_error "PCF: CRITICAL! Appended non-empty processed_block (length ${#processed_block_content}) from block #$server_block_counter, but new_file_content did not grow as expected (or shrank)! Previous length: $prev_new_file_content_length, Current length: ${#new_file_content}" >&2
                fi
                log_debug "PCF: ----- END DIAGNOSTICS for Block #$server_block_counter -----" >&2

                current_block_lines_for_processing=()
                in_server_block=false
            elif [[ $brace_level -lt 0 ]]; then
                log_error "Mismatched braces in $config_file_path. Appending rest of current block attempt."
                new_file_content+=$(printf '%s\n' "${current_block_lines_for_processing[@]}")
                in_server_block=false
                brace_level=0
                current_block_lines_for_processing=()
            fi
        else # Not in a server block context, just append the line
            new_file_content+="$original_line\n"
        fi
    done <"$config_file_path"

    if $in_server_block; then
        log_error "Reached end of file $config_file_path, but still in an unclosed server block. Appending remaining content."
        new_file_content+=$(printf '%s\n' "${current_block_lines_for_processing[@]}")
    fi

    if $file_was_changed; then
        log_info "Updating $config_file_path with changes." >&2

        # Preserve permissions and ownership
        local original_perms original_owner original_group
        original_perms=$(stat -c "%a" "$config_file_path")
        # Check if stat succeeded (important with set -e)
        if [ -z "$original_perms" ]; then # Simple check, stat failing might make it empty or error.
            log_error "Could not stat $config_file_path to get permissions. Aborting write for this file." >&2
            return 1
        fi
        original_owner=$(stat -c "%u" "$config_file_path")
        if [ -z "$original_owner" ]; then
            log_error "Could not stat $config_file_path to get owner. Aborting write for this file." >&2
            return 1
        fi
        original_group=$(stat -c "%g" "$config_file_path")
        if [ -z "$original_group" ]; then
            log_error "Could not stat $config_file_path to get group. Aborting write for this file." >&2
            return 1
        fi

        # Temporary file path
        local temp_file_path="$config_file_path.tmp"

        # --- BEGIN CRITICAL DEBUGGING ---
        log_debug "=== BEGIN new_file_content for $config_file_path (length ${#new_file_content}) ===" >&2
        # Using printf to stderr for potentially multi-line content to avoid issues with log_debug's echo -e
        printf "%s\n" "$new_file_content" >&2
        log_debug "=== END new_file_content for $config_file_path ===" >&2
        # --- END CRITICAL DEBUGGING ---

        log_debug "Attempting to write new content to temporary file: $temp_file_path" >&2
        # THE ACTUAL WRITE TO TEMP FILE:
        if printf "%s" "$new_file_content" >"$temp_file_path"; then
            log_debug "Successfully wrote to temporary file: $temp_file_path" >&2
            # Securely move the temp file to the original file path
            if sudo mv "$temp_file_path" "$config_file_path"; then
                log_success "Successfully moved temporary file to $config_file_path"
                # Restore original permissions and ownership
                if sudo chmod "$original_perms" "$config_file_path"; then
                    log_debug "Restored original permissions for $config_file_path"
                else
                    log_error "Failed to restore original permissions for $config_file_path"
                fi
                if sudo chown "$original_owner:$original_group" "$config_file_path"; then
                    log_debug "Restored original ownership for $config_file_path"
                else
                    log_error "Failed to restore original ownership for $config_file_path"
                fi
            else
                log_error "Failed to move temporary file $temp_file_path to $config_file_path. Original file may be intact or .tmp file may exist ($?)."
                if [ -f "$temp_file_path" ]; then
                    log_info "Cleaning up temporary file: $temp_file_path" >&2
                    sudo rm "$temp_file_path"
                fi
            fi
        else
            log_error "Failed to write to temporary file $temp_file_path ($?). Original file $config_file_path should be untouched." >&2
            if [ -f "$temp_file_path" ]; then
                log_info "Cleaning up temporary file (due to write failure): $temp_file_path" >&2
                sudo rm "$temp_file_path"
            fi
        fi
    else
        log_info "No changes were made to $config_file_path" >&2
    fi

    log_info "Finished processing Nginx config file: $config_file_path" >&2
    log_info "Found $server_block_counter server block(s)" >&2
}

# --- Main Script --- #
main() {
    log_header "Starting SSL Certificate Management"

    # 1. Test Nginx config before doing anything
    check_nginx_config

    # 2. Find Nginx config files
    find_nginx_configs

    # Placeholder for processing each configuration file
    log_header "Processing Configuration Files"
    if [ ${#NGINX_CONFIG_FILES[@]} -gt 0 ]; then
        for config_file in "${NGINX_CONFIG_FILES[@]}"; do
            process_config_file "$config_file"
        done
    else
        # This case should be handled by find_nginx_configs exiting, but as a safeguard:
        log_info "No configuration files to process."
    fi

    # Placeholder for final Nginx test and reload
    log_header "Finalizing SSL Setup"
    check_nginx_config   # Check config again if changes might have been made
    reload_nginx_service # Reload Nginx if any certs were updated or blocks changed

    log_success "SSL Certificate Management Script Finished."
}

# Run main function if the script is executed directly
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main
fi
