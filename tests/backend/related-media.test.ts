import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectVideo } from "@/server/evidence/video";
import { mediaResponse } from "@/server/evidence/media-response";

describe("bounded related media", () => {
  it("parses the actual playable reconstruction without a remote codec or transcription service", async () => {
    const video = await inspectVideo(await readFile("assets/demo/tracking-reconstruction.mp4"));
    expect(video.width).toBe(960); expect(video.height).toBe(540);
    expect(video.duration).toBeCloseTo(5, 1);
    await expect(inspectVideo(Buffer.from("<html>not a movie</html>"))).rejects.toThrow("unsupported_file_type");
  });
  it("supports a single bounded byte range and rejects malformed/unsatisfiable ranges", async () => {
    const bytes = Buffer.from("0123456789");
    const response = mediaResponse(bytes, "video/mp4", "bytes=2-5");
    expect(response.status).toBe(206); expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
    expect(await mediaResponse(bytes, "video/mp4", "bytes=-3").text()).toBe("789");
    for (const range of ["bytes=12-", "bytes=5-2", "bytes=1-2,4-5", "bytes=-0", "bytes=999999999999999999999-"]) expect(mediaResponse(bytes, "video/mp4", range).status).toBe(416);
    expect(mediaResponse(bytes, "video/mp4", null).headers.get("Cache-Control")).toBe("private, no-store");
  });
});
