"""
Generate the scenery. Resumable, like the characters.

    OPENAI_API_KEY=... python3 scripts/scenery/generate_all.py

Anything already on disk is skipped, so the fix for a partial run is to run it
again — which matters, because roughly one call in four comes back HTTP 520 from
the edge and gpt-image-1 rate-limits at about three concurrent.
"""

from __future__ import annotations

import concurrent.futures as futures
import os
import pathlib
import sys
import threading
import time

# The character pipeline is appended rather than prepended: both directories
# have a module the other would shadow, and this file wants its own catalogue.
HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.append(str(HERE.parent / "characters"))

from generate import generate  # noqa: E402  — shared with the character pipeline
from catalogue import SCENERY, prompt_for  # noqa: E402

RAW = pathlib.Path("scripts/scenery/raw")

CONCURRENCY = 3
ATTEMPTS = 5

printing = threading.Lock()


def say(message: str) -> None:
    with printing:
        print(message, flush=True)


def one(name: str, api_key: str) -> bool:
    destination = RAW / f"{name}.png"
    if destination.exists() and destination.stat().st_size > 10_000:
        say(f"  {name:<18} skipped, already have it")
        return True

    for attempt in range(1, ATTEMPTS + 1):
        try:
            generate(prompt_for(name), destination, model="gpt-image-1", api_key=api_key)
            say(f"  {name:<18} ok" + (f" (attempt {attempt})" if attempt > 1 else ""))
            return True
        except Exception as error:
            message = str(error)
            if attempt == ATTEMPTS:
                say(f"  {name:<18} GAVE UP — {message[:60]}")
                return False
            time.sleep(25 if "429" in message else 4 * attempt)
    return False


def main() -> int:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2

    RAW.mkdir(parents=True, exist_ok=True)
    names = list(SCENERY)
    started = time.time()

    with futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        results = list(pool.map(lambda name: one(name, api_key), names))

    done = sum(results)
    print(f"\n{done}/{len(names)} pieces in {time.time() - started:.0f}s")
    if done < len(names):
        print("Run again to retry the ones that failed — finished pieces are skipped.")
    return 0 if done == len(names) else 1


if __name__ == "__main__":
    raise SystemExit(main())
