"use client";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/atoms/Button";
import { actionsApi, type ActionsApi } from "@/lib/actions-api";
import type { Assistance } from "@/lib/assistance";
import { actionWords } from "@/lib/actions-copy";

export function AssistanceOptions({ language, api = actionsApi }: { language: Assistance["language"]; api?: ActionsApi }) {
  const [loaded, setLoaded] = useState<Assistance | null>(null);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const words = actionWords[language];
  useEffect(() => {
    const controller = new AbortController();
    api.assistance(language, controller.signal).then(guidance => { if (!controller.signal.aborted) { setLoaded(guidance); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [api, language, retry]);
  const guidance = loaded?.language === language ? loaded : null;
  return <section aria-label={words.assistance}>
    <h3>{words.assistance}</h3><p>{words.free}</p>
    {failed ? <div role="alert"><p>{words.stale}</p><Button onClick={() => setRetry(value => value + 1)}>{words.retry}</Button></div> : !guidance ? <p role="status">…</p> : guidance.options.map(option => <section className="next-row" key={option.id}><div>
      <h3>{option.title}</h3>
      <p>{option.status === "current" ? option.body : words.stale}</p><p>{option.applicability}</p>
      <p>{words.checked}: {option.checkedAt} · {words.due}: {option.reviewBy}</p>
      <a href={option.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{words.source}</a>
      {option.status === "current" && <p><a className={buttonVariants({ size: "sm" })} href={option.routeUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{words.route}</a></p>}
    </div></section>)}
  </section>;
}
