#!/bin/bash
output=$(docker run quay.io/invidious/youtube-trusted-session-generator)
visitor_data=$(echo "$output" | grep -oP 'visitor_data: \K.*')
po_token=$(echo "$output" | grep -oP 'po_token: \K.*')
current_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
json_output=$(jq -n \
                  --arg visitor_data "$visitor_data" \
                  --arg po_token "$po_token" \
                  --arg current_time "$current_time" \
                  '{visitor_data: $visitor_data, po_token: $po_token, timestamp: $current_time}')

output_file="../../data/yt_session.json"

echo "$json_output" > "$output_file"
