"""Build the project mark and three original reminder loops."""

from array import array
from math import exp, hypot, pi, sin
from pathlib import Path
from struct import pack
import sys
import wave
import zlib

EXTENSION = Path(__file__).resolve().parents[1] / "extension"


def curve(points):
    for step in range(16):
        t = step / 16
        u = 1 - t
        weights = (u**3, 3 * u * u * t, 3 * u * t * t, t**3)
        yield tuple(sum(weight * point[axis] for weight, point in zip(weights, points)) for axis in (0, 1))


LEAF = tuple(curve(((.42, .65), (.35, .40), (.54, .25), (.78, .21)))) + tuple(
    curve(((.78, .21), (.81, .43), (.70, .62), (.42, .65)))
)


def inside_polygon(x, y, points):
    inside = False
    for (left, top), (right, bottom) in zip(points, points[1:] + points[:1]):
        if (top > y) != (bottom > y) and x < left + (right - left) * (y - top) / (bottom - top):
            inside = not inside
    return inside


def distance_to_segment(x, y, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    ratio = ((x - start[0]) * dx + (y - start[1]) * dy) / (dx * dx + dy * dy)
    ratio = min(1, max(0, ratio))
    return hypot(x - start[0] - ratio * dx, y - start[1] - ratio * dy)


def mark_pixel(x, y):
    corner_x = max(.26, min(.74, x))
    corner_y = max(.26, min(.74, y))
    if hypot(x - corner_x, y - corner_y) > .23:
        return (0, 0, 0, 0)

    forest = (30, 81, 64, 255)
    if distance_to_segment(x, y, (.28, .32), (.28, .73)) < .033 or distance_to_segment(
        x, y, (.28, .73), (.70, .73)
    ) < .033:
        return (245, 248, 230, 255)
    if inside_polygon(x, y, LEAF):
        if distance_to_segment(x, y, (.43, .65), (.69, .35)) < .015:
            return forest
        return (182, 224, 147, 255)
    return forest


def png_chunk(kind, data):
    return pack(">I", len(data)) + kind + data + pack(">I", zlib.crc32(kind + data))


def write_icon(size, destination=None, mark_scale=1):
    pixels = bytearray()
    offsets = (.125, .375, .625, .875)
    grid = size * mark_scale
    padding = (size - grid) / 2
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples = [
                mark_pixel((x + i - padding) / grid, (y + j - padding) / grid)
                for i in offsets for j in offsets
            ]
            opaque = [sample for sample in samples if sample[3]]
            rgb = [round(sum(sample[channel] for sample in opaque) / len(opaque)) for channel in range(3)] if opaque else [0, 0, 0]
            pixels.extend((*rgb, round(255 * len(opaque) / len(samples))))
    image = b"\x89PNG\r\n\x1a\n"
    image += png_chunk(b"IHDR", pack(">2I5B", size, size, 8, 6, 0, 0, 0))
    image += png_chunk(b"IDAT", zlib.compress(pixels, 9))
    image += png_chunk(b"IEND", b"")
    output = destination or EXTENSION / "icons" / f"icon{size}.png"
    output.write_bytes(image)


def write_loop(filename, notes, spacing, decay):
    rate = 24000
    length = spacing * len(notes)
    samples = [0.0] * round(rate * length)
    for beat, pitches in enumerate(notes):
        start = round(rate * spacing * beat)
        for pitch in pitches:
            frequency = 440 * 2 ** ((pitch - 69) / 12)
            for index in range(start, min(len(samples), start + round(rate * 2.4))):
                time = (index - start) / rate
                phase = 2 * pi * frequency * time
                envelope = min(1, time / .05) * exp(-decay * time)
                tone = sin(phase) + .16 * sin(2 * phase) + .05 * sin(3 * phase)
                samples[index] += .115 * envelope * tone
    pcm = array("h", (
        round(32767 * max(-.9, min(.9, value)) * min(1, (len(samples) - 1 - index) / (rate * .2)))
        for index, value in enumerate(samples)
    ))
    if sys.byteorder == "big":
        pcm.byteswap()
    with wave.open(str(EXTENSION / "sounds" / filename), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        output.writeframes(pcm.tobytes())


if __name__ == "__main__":
    for size in (16, 32, 48, 128):
        write_icon(size)
    write_loop("music1.wav", [(55, 62), (67,), (64,), (), (57, 64), (69,), (62,), ()], .85, 1.9)
    write_loop("music2.wav", [(48, 60), (), (55,), (62,), (53, 60), (), (57,), ()], 1.02, 1.6)
    write_loop("music3.wav", [(60, 64), (72,), (69,), (), (55, 62), (71,), (67,), ()], .69, 2.4)
