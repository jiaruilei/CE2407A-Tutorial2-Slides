#!/usr/bin/env python3
"""Rebuild the original PDF question snapshots used in Tutorial 2.

Requires Python with Pillow and Poppler's pdftoppm on PATH. The source PDFs
are intentionally not bundled; pass the directory containing both tutorial
question sets with --source-dir. No content is retyped into the snapshots.

Render: 288 dpi = 4 raster pixels per PDF point.
Display: 2 CSS pixels per PDF point (half the PNG's native dimensions).
Crop coordinates are PDF points measured from the top-left of the page.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
DPI = 288
RASTER_SCALE = DPI / 72
CSS_SCALE = 2

# set, page, crop bbox (left, top, right, bottom), slide position (left, top)
CROPS = [
    {
        "file": "set1-q6.png", "set": 1, "question": 6, "page": 4,
        "bbox_pt": [92, 53, 521, 323], "position_css": [98, 132],
        "alt": 'Tutorial Set 1, Question 6. "Liquefaction of sand" denotes a phenomenon in foundation engineering of which a mass of saturated sand suddenly loses its bearing capacity because of rapid changes in loading conditions, for example, resulting from earthquake vibrations. When this happens, disastrous effects on the structures may follow. For simplicity, let us rate the earthquake intensities into low (L), medium (M), and high (H). The likelihoods of liquefaction associated with the earthquakes of these intensities are 0.05, 0.20, and 0.90, respectively. Assume that the relative frequencies of occurrence of earthquakes L, M, and H are 1, 0.1, and 0.01 per year, respectively. (a) What is the probability that the next earthquake is of low intensity (L)? (b) What is the probability of liquefaction of sand at the site during the next earthquake? (c) What is the probability that the sand will survive for the next three earthquakes (that is, no liquefaction)? Assume the conditions between earthquakes are statistically independent. (d) What is the probability that the earthquake is low intensity if there is liquefaction?',
    },
    {
        "file": "set1-q7.png", "set": 1, "question": 7, "page": 4,
        "bbox_pt": [92, 356, 521, 596], "position_css": [98, 132],
        "alt": 'Tutorial Set 1, Question 7. Two independent remote sensing devices, A and B, mounted on an airplane are used to determine the locations of diseased trees in a large area of forest land. The detectability of device A is 0.8 (that is, the probability that a group of diseased trees will be detected by device A is 0.8), whereas the detectability of device B is 0.9. However, when a group of diseased trees has been detected its location may not be pinpointed accurately by either device. Based on a detection from device A alone, the location can be accurately determined with probability 0.7, whereas the corresponding probability with device B alone is only 0.4. If the same group of diseased trees is detected by both devices, its location can be pinpointed with certainty. Determine the following. (a) The probability that a group of diseased trees will be detected. (b) The probability that a group of diseased trees will be detected by only one device. (c) The probability of accurately locating a group of diseased trees.',
    },
    {
        "file": "set2-q1.png", "set": 2, "question": 1, "page": 1,
        "bbox_pt": [92, 144, 521, 316], "position_css": [98, 132],
        "alt": 'Tutorial Set 2, Question 1. A contractor is submitting bids to 3 jobs, A, B, and C. The probabilities that he will win each of the three jobs are P(A)=0.5, P(B)=0.8, and P(C)=0.2, respectively. Assume events A, B, C are statistically independent. Let X be the total number of jobs the contractor will win. (a) What are the possible values of X? Compute and plot the probability mass function (PMF) of the random variable X. (b) Plot the cumulative distribution function of X. (c) Determine P(X less than or equal to 2). (d) Determine P(0 less than X less than or equal to 2).',
    },
    {
        "file": "set2-q2-statement.png", "set": 2, "question": 2, "page": 1,
        "bbox_pt": [92, 339, 431, 414], "position_css": [98, 132],
        "alt": 'Tutorial Set 2, Question 2. The probability density function is f_R(r)=c(r-10)(20-r) for 10 less than or equal to r less than or equal to 20, and zero elsewhere, where c is a constant.',
    },
    {
        "file": "set2-q2-diagram.png", "set": 2, "question": 2, "page": 1,
        "bbox_pt": [180, 423, 386, 553], "position_css": [98, 310],
        "alt": 'Question 2 probability density graph, with vertical axis f_R(r) and horizontal axis r. The curve is a downward-opening parabola meeting the horizontal axis at r=10 and r=20.',
    },
    {
        "file": "set2-q2-parts.png", "set": 2, "question": 2, "page": 1,
        "bbox_pt": [92, 554, 339, 725], "position_css": [550, 310],
        "alt": 'Question 2 parts: (a) What is the value of c? (b) Derive the cumulative distribution function F_R(r). (c) Determine i. Mean value of R; ii. Median of R; iii. Mode of R; iv. Standard deviation of R; v. Coefficient of variation of R; vi. Skewness coefficient.',
    },
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path,
                        help="Directory containing CE2407A Tutorial Questions Set 1.pdf and Set 2.pdf")
    parser.add_argument("--output-dir", type=Path, default=REPO / "assets" / "questions")
    parser.add_argument("--work-dir", type=Path, default=REPO / "tmp" / "question-extraction")
    args = parser.parse_args()
    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm is None:
        parser.error("Poppler pdftoppm was not found on PATH")

    sources = {number: args.source_dir / f"CE2407A Tutorial Questions Set {number}.pdf"
               for number in (1, 2)}
    for source in sources.values():
        if not source.is_file():
            parser.error(f"Missing source PDF: {source}")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    work_dir = args.work_dir.resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "render_dpi": DPI,
        "raster_pixels_per_pdf_point": RASTER_SCALE,
        "css_pixels_per_pdf_point": CSS_SCALE,
        "coordinate_system": "PDF points from page top-left",
        "sources": [{"set": number, "filename": source.name,
                     "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}
                    for number, source in sources.items()],
        "snapshots": [],
    }
    with tempfile.TemporaryDirectory(prefix="render-", dir=work_dir) as temp:
        # Validate the directory before TemporaryDirectory recursively cleans it.
        if not Path(temp).resolve().is_relative_to(work_dir):
            raise ValueError("Temporary directory is outside the selected work directory")
        page_images: dict[tuple[int, int], Image.Image] = {}
        for number, page in sorted({(crop["set"], crop["page"]) for crop in CROPS}):
            prefix = Path(temp) / f"set{number}-page{page}"
            subprocess.run([pdftoppm, "-f", str(page), "-singlefile", "-r", str(DPI),
                            "-png", str(sources[number]), str(prefix)], check=True)
            page_images[(number, page)] = Image.open(prefix.with_suffix(".png")).convert("RGB")
        for crop in CROPS:
            left, top, right, bottom = crop["bbox_pt"]
            pixel_bbox = tuple(round(value * RASTER_SCALE) for value in (left, top, right, bottom))
            snapshot = page_images[(crop["set"], crop["page"])].crop(pixel_bbox)
            snapshot.save(args.output_dir / crop["file"], optimize=True, dpi=(DPI, DPI))
            dimensions = [(right - left) * CSS_SCALE, (bottom - top) * CSS_SCALE]
            x, y = crop["position_css"]
            if x + dimensions[0] > 1259 or y + dimensions[1] > 700:
                raise ValueError(f"Snapshot exceeds slide-safe area: {crop['file']}")
            manifest["snapshots"].append({**crop, "dimensions_css": dimensions,
                                           "dimensions_px": list(snapshot.size)})
            print(f"{crop['file']}: {snapshot.width}x{snapshot.height}px -> "
                  f"{dimensions[0]}x{dimensions[1]} CSS px at ({x}, {y})")
        for page_image in page_images.values():
            page_image.close()

    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
