"""Bounded local parser. Input is one read-only mount, not an application path."""
import json
import math
import os
import re
import resource
import subprocess
import sys
import tempfile
import time
import warnings
from PIL import Image, ImageOps

MAX_PIXELS = 8_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)
resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024,) * 2)
resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
deadline = time.monotonic() + 55


def run(arguments, limit=65536):
    remaining = min(20, deadline - time.monotonic())
    if remaining <= 0:
        raise ValueError("processing_timeout")
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        try:
            subprocess.run(arguments, stdout=output, stderr=errors,
                           check=True, timeout=remaining)
        except subprocess.TimeoutExpired:
            raise ValueError("processing_timeout")
        except subprocess.CalledProcessError:
            errors.seek(0)
            if b"Incorrect password" in errors.read(4096):
                raise ValueError("encrypted_pdf")
            raise ValueError("document_malformed")
        output.seek(0)
        content = output.read(limit + 1)
        if len(content) > limit:
            raise ValueError("text_limit")
        return content.decode("utf-8", errors="strict")


def normalized_image(path):
    try:
        with Image.open(path) as original:
            width, height = original.size
            if width < 1 or height < 1 or width * height > MAX_PIXELS or max(width, height) > 8000:
                raise ValueError("image_limit")
            if getattr(original, "n_frames", 1) != 1:
                raise ValueError("animated_image")
            original.verify()
        with Image.open(path) as original:
            rotated = ImageOps.exif_transpose(original)
            # Flatten transparency; send only decoded pixels to OCR, not metadata.
            rgba = rotated.convert("RGBA")
            canvas = Image.new("RGB", rgba.size, "white")
            canvas.paste(rgba, mask=rgba.getchannel("A"))
            canvas.save("/tmp/normalized.png")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("image_limit")


def ocr(path):
    normalized_image(path)
    return run(["tesseract", "/tmp/normalized.png", "stdout", "-l", "hin+eng", "--oem", "1", "--psm", "3", "quiet"], 24000)


def pdf():
    info = run(["pdfinfo", "-f", "1", "-l", "3", "-box", "/input/document"])
    counts = re.findall(r"^Pages:\s*(\d+)\s*$", info, re.M)
    encryption = re.findall(r"^Encrypted:\s*(\w+)", info, re.M)
    if len(counts) != 1 or len(encryption) != 1:
        raise ValueError("document_malformed")
    if encryption[0] != "no":
        raise ValueError("encrypted_pdf")
    count = int(counts[0])
    if not 1 <= count <= 3:
        raise ValueError("page_limit")
    dimensions = re.findall(r"^Page\s+(\d+) size:\s*([\d.]+) x ([\d.]+)", info, re.M)
    if len(dimensions) != count:
        raise ValueError("document_malformed")
    for number, width, height in dimensions:
        pixels = [math.ceil(float(side) * 150 / 72) for side in (width, height)]
        if min(pixels) < 1 or pixels[0] * pixels[1] > MAX_PIXELS or max(pixels) > 8000:
            raise ValueError("image_limit")
    pages = []
    for number in range(1, count + 1):
        words = run(["pdftotext", "-f", str(number), "-l", str(number), "-layout", "-nopgbrk", "-enc", "UTF-8", "/input/document", "-"], 24000)
        method = "pdf-text"
        if not words.strip():
            run(["pdftoppm", "-f", str(number), "-l", str(number), "-singlefile", "-r", "150", "-png", "/input/document", "/tmp/page"])
            words, method = ocr("/tmp/page.png"), "ocr"
            os.unlink("/tmp/page.png")
        pages.append({"number": number, "method": method, "text": words})
        # JS counts UTF-16 units; use the same budget before returning anything.
        if sum(len(page["text"].encode("utf-16-le")) // 2 for page in pages) + 2 * (len(pages) - 1) > 6000:
            raise ValueError("text_limit")
    return pages


try:
    file_format = sys.argv[1]
    if file_format == "pdf":
        pages = pdf()
    elif file_format in ("png", "jpeg"):
        pages = [{"number": 1, "method": "ocr", "text": ocr("/input/document")}]
    else:
        raise ValueError("unsupported_file_type")
    print(json.dumps({"pages": pages}, ensure_ascii=False))
except Exception as failure:
    allowed = {"processing_timeout", "document_malformed", "encrypted_pdf", "page_limit", "image_limit", "animated_image", "text_limit", "unsupported_file_type"}
    code = str(failure) if str(failure) in allowed else "document_malformed"
    print(json.dumps({"error": code}))
