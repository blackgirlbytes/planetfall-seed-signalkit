import io
import unittest
import urllib.request

import signalkit.client as client_module
from signalkit.client import fetch


class FakeResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class TestFetch(unittest.TestCase):
    def test_retries_twice_then_succeeds(self):
        calls = []

        def fake_urlopen(url, timeout):
            calls.append(url)
            if len(calls) < 3:
                raise OSError("simulated network error")
            return FakeResponse(b"hello telemetry")

        original = urllib.request.urlopen
        try:
            urllib.request.urlopen = fake_urlopen
            # patch sleep so the test doesn't actually wait
            slept = []
            original_sleep = client_module.time.sleep
            client_module.time.sleep = slept.append

            result = fetch("http://example.com/frame")
        finally:
            urllib.request.urlopen = original
            client_module.time.sleep = original_sleep

        self.assertEqual(result, b"hello telemetry")
        self.assertEqual(len(calls), 3)
        self.assertEqual(slept, [0.5, 1.0])  # sleep(0.5*1) then sleep(0.5*2)

    def test_raises_after_all_attempts_fail(self):
        def always_fail(url, timeout):
            raise OSError("always fails")

        original = urllib.request.urlopen
        original_sleep = client_module.time.sleep
        try:
            urllib.request.urlopen = always_fail
            client_module.time.sleep = lambda _: None
            with self.assertRaises(OSError):
                fetch("http://example.com/frame", max_retries=3)
        finally:
            urllib.request.urlopen = original
            client_module.time.sleep = original_sleep


if __name__ == "__main__":
    unittest.main()
