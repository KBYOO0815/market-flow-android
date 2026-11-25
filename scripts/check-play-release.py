"""Inspect Play version codes in a temporary edit; never publish or commit."""
import json
import os
import sys
from urllib.parse import quote

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ("before", "after"):
        raise ValueError("Expected before or after")
    phase = sys.argv[1]
    expected = int(os.environ["EXPECTED_VERSION_CODE"])
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    session = AuthorizedSession(credentials)
    base = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.kbyoo0815.marketflow/edits"

    def request(method, url, **kwargs):
        response = session.request(method, url, timeout=45, **kwargs)
        if not response.ok:
            raise RuntimeError(f"Google Play API {method} failed: HTTP {response.status_code}")
        return response

    edit_id = request("POST", base, json={}).json()["id"]
    edit = base + "/" + quote(edit_id, safe="")
    try:
        tracks = request("GET", edit + "/tracks").json().get("tracks", [])
        if phase == "before":
            codes = [
                int(code)
                for track in tracks
                for release in track.get("releases", [])
                for code in release.get("versionCodes", [])
            ]
            for endpoint, field in (("bundles", "bundles"), ("apks", "apks")):
                for artifact in request("GET", edit + "/" + endpoint).json().get(field, []):
                    codes.append(int(artifact["versionCode"]))
            if not codes:
                raise RuntimeError("No existing Play version codes returned; refusing to publish")
            highest = max(codes)
            if expected <= highest:
                raise RuntimeError(f"Requested versionCode {expected} is not newer than observed {highest}")
            print(f"Play version check passed: {expected} > {highest}")
        else:
            matching = [
                release
                for track in tracks if track.get("track") == "internal"
                for release in track.get("releases", [])
                if release.get("status") == "completed"
                and str(expected) in [str(code) for code in release.get("versionCodes", [])]
            ]
            if not matching:
                raise RuntimeError("Expected completed internal release not visible in Play API")
            print(f"Google Play internal track: completed versionCode {expected}")
    finally:
        try:
            request("DELETE", edit)
        finally:
            session.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Avoid dumping credentials, response bodies or stack traces.
        if isinstance(exc, RuntimeError):
            print(str(exc), file=sys.stderr)
        else:
            print(f"Play verification failed: {type(exc).__name__}", file=sys.stderr)
        sys.exit(1)
