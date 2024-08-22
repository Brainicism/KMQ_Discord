#!/bin/bash
set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <directory> <docker|bgutil>"
    exit 1
fi

output_dir="$1"
mode="$2"

# Ensure the directory exists
if [ ! -d "$output_dir" ]; then
    echo "Directory $output_dir does not exist."
    exit 1
fi

cookie_file="$output_dir/yt_session.cookie"

generate_session_data_via_docker_chrome_driver() {
    echo "Running session generator with Docker"
    session_data=$(docker run quay.io/invidious/youtube-trusted-session-generator)
}

generate_session_data_via_bgutils() {
    echo "Grabbing cookies (with visitor ID) from youtube"
    curl --cookie-jar $cookie_file --silent --output /dev/null --show-error --fail https://www.youtube.com
    
    echo "Running session generator with BG Utils"
    session_data=$(npx ts-node src/scripts/generate-yt-session-bgutils.ts)
}

# Generate session data based on the mode
if [ "$mode" == "docker" ]; then
    generate_session_data_via_docker_chrome_driver
elif [ "$mode" == "bgutil" ]; then
    generate_session_data_via_bgutils
else
    echo "Invalid mode: $mode. Use 'docker' or 'bgutil'."
    exit 1
fi

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

expiration_time=$(date -d "+6 months" +"%s")
echo "# Netscape HTTP Cookie File" > "$cookie_file"
echo -e ".youtube.com\tTRUE\t/\tTRUE\t$expiration_time\tVISITOR_INFO1_LIVE\t$visitor_id" >> "$cookie_file"

echo "Cookie file saved to $cookie_file"
