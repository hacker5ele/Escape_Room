"""
Generate the whole catalogue: eighty parts, twenty per slot.

Resumable on purpose. Roughly one call in four comes back HTTP 520 from the
edge with an HTML error page, and gpt-image-1 rate-limits at about three
concurrent — so over eighty calls something always goes wrong. Anything already
on disk is skipped, which means the fix for a bad run is to run it again.

    OPENAI_API_KEY=... python3 scripts/characters/generate_all.py [--only head]
"""

from __future__ import annotations

import argparse
import concurrent.futures as futures
import os
import pathlib
import sys
import threading
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))

from generate import generate  # noqa: E402
from parts import SLOTS, part_id, prompt_for  # noqa: E402

RAW = pathlib.Path("scripts/characters/raw")

# Three at a time. Above that the 429 rate climbs sharply and the retries cost
# more wall-clock than the concurrency saves.
CONCURRENCY = 3
ATTEMPTS = 5

printing = threading.Lock()


def say(message: str) -> None:
    with printing:
        print(message, flush=True)


def one(job: tuple[str, int], api_key: str) -> bool:
    slot, index = job
    name = part_id(slot, index)
    destination = RAW / slot / f"{name}.png"

    if destination.exists() and destination.stat().st_size > 10_000:
        say(f"  {name:<10} skipped, already have it")
        return True

    for attempt in range(1, ATTEMPTS + 1):
        try:
            generate(prompt_for(slot, index), destination, model="gpt-image-1", api_key=api_key)
            say(f"  {name:<10} ok" + (f" (attempt {attempt})" if attempt > 1 else ""))
            return True
        except Exception as error:
            message = str(error)
            if attempt == ATTEMPTS:
                say(f"  {name:<10} GAVE UP — {message[:70]}")
                return False
            # A 429 needs real time; a 520 just needs another go.
            time.sleep(25 if "429" in message else 4 * attempt)
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", choices=sorted(SLOTS), help="generate a single slot")
    arguments = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2

    slots = [arguments.only] if arguments.only else list(SLOTS)
    jobs = [(slot, index) for slot in slots for index in range(len(SLOTS[slot][1]))]
    for slot in slots:
        (RAW / slot).mkdir(parents=True, exist_ok=True)

    started = time.time()
    with futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        results = list(pool.map(lambda job: one(job, api_key), jobs))

    done = sum(results)
    print(f"\n{done}/{len(jobs)} parts in {time.time() - started:.0f}s")
    if done < len(jobs):
        print("Run again to retry the ones that failed — finished parts are skipped.")
    return 0 if done == len(jobs) else 1


if __name__ == "__main__":
    raise SystemExit(main())
