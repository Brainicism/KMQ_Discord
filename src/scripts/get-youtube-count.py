# Requires file named client_secret.json in same directory, containing
# OAuth 2.0 Client ID with youtube.readonly scope in YouTube Data API v3
# https://console.developers.google.com/
#
# Required modules:
# python -m pip install
# mysql
# mysql-connector
# python-dotenv
# google-api-python-client
# google-auth-oauthlib

import os
import json
import mysql.connector

import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.errors
from dotenv import load_dotenv

load_dotenv()

scopes = ["https://www.googleapis.com/auth/youtube.readonly"]

db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASS"),
    database=os.getenv("DB_KMQ_SETTINGS_TABLE_NAME")
)

cursor = db.cursor()

cursor.execute("SELECT link FROM available_songs")

songs = [i[0] for i in cursor.fetchall()]

def main():
    # Disable OAuthlib's HTTPS verification when running locally.
    # *DO NOT* leave this option enabled in production.
    # os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

    api_service_name = "youtube"
    api_version = "v3"
    client_secrets_file = "client_secret.json"

    # Get credentials and create an API client
    flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
        client_secrets_file, scopes)
    credentials = flow.run_console()
    youtube = googleapiclient.discovery.build(
        api_service_name, api_version, credentials=credentials)

    i = 0
    while i < len(songs):
        request = youtube.videos().list(
            part="statistics",
            id=songs[i:i + 50]
        )
        response = request.execute()
        for song in response["items"]:
            cursor.execute("""UPDATE available_songs SET views = %s where link = %s""", (song["statistics"]["viewCount"], song["id"]))
        i += 50


    db.commit()
    print("Successful,", len(songs), "rows updated")

if __name__ == "__main__":
    main()
