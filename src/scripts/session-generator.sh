#!/bin/bash
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <output_file>"
    exit 1
fi

session_data=$(docker run quay.io/invidious/youtube-trusted-session-generator)
visitor_data=$(echo "$session_data" | grep -oP 'visitor_data: \K.*')
po_token=$(echo "$session_data" | grep -oP 'po_token: \K.*')
generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
json_output=$(jq -n \
                  --arg visitor_data "$visitor_data" \
                  --arg po_token "$po_token" \
                  --arg generated_at "$generated_at" \
                  '{visitor_data: $visitor_data, po_token: $po_token, generated_at: $generated_at}')

output_file="$1"
echo "$json_output" > "$output_file"