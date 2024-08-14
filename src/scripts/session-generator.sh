#!/bin/bash
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <directory>"
    exit 1
fi

# Get the directory argument
output_dir="$1"

# Ensure the directory exists
if [ ! -d "$output_dir" ]; then
    echo "Directory $output_dir does not exist."
    exit 1
fi

echo "Running session generator"
session_data=$(docker run quay.io/invidious/youtube-trusted-session-generator)

echo "Extracting session data from stdout"
visitor_data=$(echo "$session_data" | grep -oP 'visitor_data: \K.*')
po_token=$(echo "$session_data" | grep -oP 'po_token: \K.*')
generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
visitor_id=$(echo "${visitor_data:0:18}" | base64 --decode | tr -d '[:space:]')

json_output=$(jq -n \
                  --arg visitor_data "$visitor_data" \
                  --arg po_token "$po_token" \
                  --arg generated_at "$generated_at" \
                  --arg visitor_id "$visitor_id" \
                  '{visitor_data: $visitor_data, po_token: $po_token, generated_at: $generated_at, visitor_id: $visitor_id}')

session_data_file="$output_dir/yt_session.json"
echo "$json_output" > "$session_data_file"
echo "Session data saved to $session_data_file"

cookie_file="$output_dir/yt_session.cookie"
expiration_time=$(date -d "+6 months" +"%s")
echo "# Netscape HTTP Cookie File" > "$cookie_file"
echo -e ".youtube.com\tTRUE\t/\tTRUE\t$expiration_time\tVISITOR_INFO1_LIVE\t$visitor_id" >> "$cookie_file"

echo "Cookie file saved to $cookie_file"
