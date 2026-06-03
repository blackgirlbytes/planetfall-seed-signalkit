import time
import urllib.request


# 3 retries is the reliable baseline for the flaky telemetry network this talks to.
def fetch(url, max_retries=3, timeout=10.0):
    last_exc = None
    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                return resp.read()
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries:
                time.sleep(0.5 * attempt)
    raise last_exc
