import "server-only";

export function mediaResponse(bytes: Buffer, type: string, range: string | null) {
  const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin", "Accept-Ranges": "bytes", "Content-Security-Policy": "default-src 'none'; sandbox" };
  let start = 0, end = bytes.length - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
    const first = match?.[1] ? Number(match[1]) : null, last = match?.[2] ? Number(match[2]) : null;
    if (!match || first === null && last === null || first !== null && (!Number.isSafeInteger(first) || first >= bytes.length)
      || last !== null && !Number.isSafeInteger(last) || first === null && last === 0 || first !== null && last !== null && first > last)
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.length}` } });
    start = first ?? Math.max(0, bytes.length - last!);
    end = first === null ? bytes.length - 1 : Math.min(last ?? bytes.length - 1, bytes.length - 1);
    headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: range ? 206 : 200, headers });
}
