"""Synthetic parser fixtures, never real incident records."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption

root = Path("tests/fixtures/evidence")
root.mkdir(parents=True, exist_ok=True)
image = Image.new("RGB", (1400, 450), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 44)
for index, line in enumerate(["FICTIONAL TEST RECORD", "Payment made for a laptop.", "Delivery has not arrived."]):
    draw.text((70, 70 + index * 100), line, fill="black", font=font)
image.save(root / "record.png")
image.save(root / "record.jpg", quality=95)
Image.new("RGB", (160, 160), "white").save(root / "blank.png")
Image.new("1", (4000, 2100), 1).save(root / "oversized.png")

document = canvas.Canvas(str(root / "text-record.pdf"))
for line in ["FICTIONAL TEST RECORD", "Payment made for a laptop."]:
    document.setFont("Helvetica", 22)
    document.drawString(60, 740, line)
    document.showPage()
document.save()
document = canvas.Canvas(str(root / "scanned-record.pdf"))
document.drawImage(str(root / "record.png"), 30, 480, width=540, height=173)
document.save()
document = canvas.Canvas(str(root / "too-many-pages.pdf"))
for index in range(4):
    document.drawString(60, 740, f"Fictional page {index + 1}")
    document.showPage()
document.save()
document = canvas.Canvas(str(root / "encrypted-record.pdf"), encrypt=StandardEncryption("synthetic-fixture-password"))
document.drawString(60, 740, "Fictional encrypted record")
document.save()
