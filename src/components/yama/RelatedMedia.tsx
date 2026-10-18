"use client";

import { useState } from "react";
import { Button } from "@/components/atoms/Button";
import type { ConnectionsResult } from "@/lib/connections";

type Media = NonNullable<ConnectionsResult["candidates"][number]["media"]>[number];
export default function RelatedMedia({ media, caseId, version, context }: { media: Media; caseId: string; version: string; context?: { reportId: string; revision: number } }) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  if (media.kind === "video" && !context) return null;
  return <figure className={media.kind === "image" ? "reply-alias-image" : "reply-evidence-image"}>
    {failed ? <div><p role="status">This media couldn’t be opened.</p><Button size="sm" variant="quiet" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Retry media</Button></div>
      : media.kind === "image" ? <img key={attempt} src={media.src} alt={media.caption} width={240} height={240} loading="lazy" onError={() => setFailed(true)} />
        : <video key={attempt} controls preload="none" aria-label={media.caption} onError={() => setFailed(true)} src={`/api/reports/${context!.reportId}/connections/${encodeURIComponent(caseId)}/video?revision=${context!.revision}&version=${version}`} />}
    <figcaption lang="en">{media.caption}</figcaption>
  </figure>;
}
