import type { ReactNode } from "react";
import StreamingText from "@/components/primitives/StreamingText";
import type { DialoguePublicContext } from "@/lib/dialogue-sources";
import SourcePreview from "./SourcePreview";
import { WebSearch } from "@/components/ui/web-search";

function emphasis(text: string, key: number) {
  return text.split(/(\*\*[^*\n]+\*\*)/u).map((part, index) => part.length > 4 && part.startsWith("**") && part.endsWith("**")
    ? <strong key={`${key}:${index}`}>{part.slice(2, -2)}</strong> : part);
}

// A deliberately small link renderer: no HTML, images or arbitrary model URLs.
// Only links present in the server's source receipt become interactive.
export default function ReplyText({ text, publicContext, reveal = false, onDone, language = "en" }: { text: string; publicContext?: DialoguePublicContext; reveal?: boolean; onDone?: () => void; language?: string }) {
  const inline = (value: string): ReactNode[] => {
    const content: ReactNode[] = []; let previous = 0;
    for (const match of value.matchAll(/\[([^\]\n]{1,150})\]\((https:\/\/[^\s)]+)\)/gu)) {
      const source = publicContext?.sources.find(source => source.url === match[2]);
      if (!source) continue;
      content.push(...emphasis(value.slice(previous, match.index), previous));
      content.push(<SourcePreview key={match.index} inline title={match[1]} href={source.url} preview={source.excerpt || source.publisher} />);
      previous = match.index + match[0].length;
    }
    content.push(...emphasis(value.slice(previous), previous)); return content;
  };
  const renderText = (value: string) => {
    const content: ReactNode[] = []; let previous = 0;
    // Only bounded pipe tables are supported; cells use the same safe text/link renderer.
    for (const match of value.matchAll(/^\|.+\|\n\|(?:\s*:?-+:?\s*\|)+\n(?:\|.+\|(?:\n|$))+/gm)) {
      const rows = match[0].trimEnd().split("\n").map(line => line.slice(1, -1).split("|").map(cell => cell.trim()));
      const [headers, , ...body] = rows;
      if (headers.length > 8 || body.length > 50 || body.some(row => row.length !== headers.length)) continue;
      content.push(<span key={`text:${match.index}`}>{inline(value.slice(previous, match.index))}</span>);
      content.push(<div key={`table:${match.index}`} className="reply-table-wrap" tabIndex={0} role="region" aria-label={language === "hi" ? "रिपोर्ट की तुलना" : "Report comparison"}>
        <table><thead><tr>{headers.map((cell, index) => <th key={index} scope="col">{inline(cell)}</th>)}</tr></thead>
          <tbody>{body.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody></table>
      </div>);
      previous = match.index + match[0].length;
    }
    content.push(<span key={`text:${previous}`}>{inline(value.slice(previous))}</span>);
    return content;
  };
  return <><StreamingText text={text} reveal={reveal} onDone={onDone} showAllLabel={language === "hi" ? "पूरा उत्तर दिखाएँ" : "Show full reply"} renderText={renderText} />
    {publicContext?.status === "ready" && !reveal && <div className="reply-web-search dark"><WebSearch status="done" label={language === "hi" ? `${publicContext.sources.length} वेब स्रोत मिले` : `${publicContext.sources.length} web sources found`} sources={publicContext.sources.map(source => ({ id: source.url, title: source.title, url: source.url, snippet: source.bodyRead ? source.excerpt : "Link found; page not read." }))} /></div>}
  </>;
}
