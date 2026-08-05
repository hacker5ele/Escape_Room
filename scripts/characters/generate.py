"""
Ask the model for one part.

Goes through curl rather than urllib on purpose. A 1024x1024 response is over a
megabyte of base64, and urllib truncated it often enough to be useless —
`IncompleteRead(409600 bytes read, 1636233 more expected)`. curl retries the
transfer itself, which turned a coin-flip into something that just works.
"""

from __future__ import annotations

import base64
import json
import pathlib
import subprocess
import tempfile

ENDPOINT = "https://api.openai.com/v1/images/generations"

# The half of the prompt that never changes. Every part is asked for in the same
# words so that what differs between them is the subject and nothing else.
STYLE = (
    "Bold flat screenprint illustration. Thick uniform black outline. "
    "Completely flat colour fill with NO shading, NO gradients, NO highlights, "
    "NO texture, NO drop shadow. Limited palette: warm red, process cyan, cream, black. "
    "Simple, graphic, confident shapes."
)


def generate(prompt: str, destination: pathlib.Path, *, model: str, api_key: str) -> dict:
    body = {
        "model": model,
        "prompt": prompt,
        "size": "1024x1024",
        "n": 1,
    }
    # Only gpt-image-1 will cut the background out for us. gpt-image-2 rejects
    # the parameter outright, so it has to be keyed out afterwards instead.
    if model == "gpt-image-1":
        body["background"] = "transparent"
        body["output_format"] = "png"

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as request_file:
        json.dump(body, request_file)
        request_path = request_file.name

    response_path = request_path + ".out"
    result = subprocess.run(
        [
            "curl", "-sS", "-o", response_path, "-w", "%{http_code}",
            "--retry", "4", "--retry-delay", "3", "--retry-all-errors",
            "--max-time", "300", "--connect-timeout", "20",
            ENDPOINT,
            "-H", f"Authorization: Bearer {api_key}",
            "-H", "Content-Type: application/json",
            "-d", f"@{request_path}",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    status = result.stdout.strip() or "no-response"
    raw = pathlib.Path(response_path).read_text()

    # Check the transport before trying to read the body. An empty file or an
    # HTML error page from the edge both parse as "Expecting value: line 1
    # column 1", which says nothing about what actually went wrong.
    if not raw.strip():
        raise RuntimeError(f"HTTP {status}: empty response ({result.stderr.strip() or 'no stderr'})")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError(f"HTTP {status}: non-JSON response — {raw[:160]!r}") from None

    if status != "200":
        raise RuntimeError(f"HTTP {status}: {payload.get('error', {}).get('message', payload)}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(base64.b64decode(payload["data"][0]["b64_json"]))
    return payload.get("usage", {})
