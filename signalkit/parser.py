def parse_frame(raw: bytes) -> dict:
    frame = {}
    for line in raw.decode().splitlines():
        if "=" in line:
            key, _, value = line.partition("=")
            frame[key.strip()] = value.strip()
    return frame
