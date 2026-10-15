"use client";

import { useId } from "react";
import type { AgentId } from "@/lib/demo-state";

export const AGENT_ART: Record<AgentId, string> = {
  saathi: "/agents/saathi-eagle-fine.png",
  drishti: "/agents/drishti-wolf-fine.png",
  disha: "/agents/disha-elephant-fine.png",
};

// Hand-placed joints follow the existing artwork in a 1000 × 1000 coordinate
// space. The complementary body mask keeps a moving part from leaving a copy
// behind. The source PNGs themselves are unchanged.
const PARTS: Record<AgentId, { name: string; path: string }[]> = {
  saathi: [
    { name: "eagle-beak", path: "M570 374 Q690 370 819 416 L849 445 L844 466 Q781 458 706 437 L558 406 Z" },
    { name: "eagle-feathers", path: "M0 340 L180 290 Q260 280 310 305 L432 390 L376 470 L334 563 L354 638 L291 751 L250 1000 H0 Z" },
    { name: "eagle-breast", path: "M434 469 C473 538 526 580 591 602 L607 772 L582 875 L552 906 L514 854 L490 937 L480 1000 H330 L388 704 L419 577 Z" },
  ],
  drishti: [
    { name: "wolf-head", path: "M0 0 H1000 V770 L928 792 L865 798 L760 804 L684 791 L602 772 L539 737 L444 773 L394 820 L320 811 L268 764 L199 749 L156 798 L0 871 Z" },
  ],
  disha: [
    { name: "elephant-trunk", path: "M692 684 C738 675 783 674 825 744 C851 791 866 831 882 884 C899 928 892 962 866 978 C830 1004 758 961 725 919 C696 884 699 859 702 826 C697 773 689 735 675 709 Z" },
    { name: "elephant-tip", path: "M714 838 Q780 816 868 836 L882 884 C899 928 892 962 866 978 C830 1004 758 961 725 919 C696 884 699 859 714 838 Z" },
  ],
};

export default function AgentPortrait({ agent, speaking = false, className = "" }: {
  agent: AgentId; speaking?: boolean; className?: string;
}) {
  const id = useId();
  const imageId = `${id}-art`;
  const bodyId = `${id}-body`;
  const tipMaskId = `${id}-no-tip`;
  const parts = PARTS[agent];
  const layer = (name: string) => <use href={`#${imageId}`} clipPath={`url(#${id}-${name})`} />;

  return <span aria-hidden="true" data-agent-portrait={agent} data-speaking={speaking} className={`agent-portrait ${className}`}>
    <svg className="agent-figure" viewBox="0 0 1000 1000" width="112" height="112" focusable="false" aria-hidden="true">
      {speaking ? <>
        <defs>
          <image id={imageId} href={AGENT_ART[agent]} width="1000" height="1000" />
          {parts.map(part => <clipPath key={part.name} id={`${id}-${part.name}`} clipPathUnits="userSpaceOnUse"><path d={part.path} /></clipPath>)}
          <mask id={bodyId} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style={{ maskType: "luminance" }}>
            <rect width="1000" height="1000" fill="white" />
            {parts.map(part => <path key={part.name} d={part.path} fill="black" />)}
          </mask>
          {agent === "disha" && <mask id={tipMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000" style={{ maskType: "luminance" }}>
            <rect width="1000" height="1000" fill="white" /><path d={parts[1].path} fill="black" />
          </mask>}
        </defs>
        <use href={`#${imageId}`} mask={`url(#${bodyId})`} />
        {agent === "disha" ? <g className="portrait-part elephant-trunk">
          <use href={`#${imageId}`} clipPath={`url(#${id}-elephant-trunk)`} mask={`url(#${tipMaskId})`} />
          <g className="portrait-part elephant-tip">{layer("elephant-tip")}</g>
        </g> : parts.map(part => <g key={part.name} className={`portrait-part ${part.name}`}>{layer(part.name)}</g>)}
      </> : <image href={AGENT_ART[agent]} width="1000" height="1000" />}
    </svg>
  </span>;
}
