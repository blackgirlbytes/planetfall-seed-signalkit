import unittest

from signalkit.parser import parse_frame


class TestParseFrame(unittest.TestCase):
    def test_basic_key_value(self):
        raw = b"temp=42\nhumidity=80\n"
        self.assertEqual(parse_frame(raw), {"temp": "42", "humidity": "80"})

    def test_value_with_equals_sign(self):
        raw = b"equation=a=b\n"
        self.assertEqual(parse_frame(raw), {"equation": "a=b"})

    def test_empty_input(self):
        self.assertEqual(parse_frame(b""), {})

    def test_lines_without_equals_are_skipped(self):
        raw = b"key=val\nno-separator\nother=x\n"
        self.assertEqual(parse_frame(raw), {"key": "val", "other": "x"})

    def test_whitespace_stripped(self):
        raw = b"  key = value  \n"
        self.assertEqual(parse_frame(raw), {"key": "value"})


if __name__ == "__main__":
    unittest.main()
