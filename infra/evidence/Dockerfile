FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin python3-pil \
    && rm -rf /var/lib/apt/lists/*
COPY extract.py /opt/yama/extract.py
RUN mkdir /input && touch /input/document && chmod 555 /input /opt/yama
ENV OMP_THREAD_LIMIT=1 OPENBLAS_NUM_THREADS=1
USER 65532:65532
ENTRYPOINT ["/usr/bin/python3", "/opt/yama/extract.py"]
