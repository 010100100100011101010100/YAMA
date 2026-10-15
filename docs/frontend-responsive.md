# Responsive chat navigation

The desktop sidebar retains BeautifulUI's navigation and row styling, with expanded labels or a 64 px icon rail. Resolved/unresolved colours remain on chat icons when collapsed. Tablet and mobile (1040 px and below) use a 60 px header and a closed-by-default chat drawer instead of placing chat history above the transcript.

The drawer uses a native modal dialog for focus containment and background isolation. Opening focuses Close. Escape, backdrop, or Close dismiss it. Selecting a saved chat, starting a chat, or opening Options also dismisses it. Resizing across the desktop breakpoint clears drawer state, while desktop collapse preference survives. Chat data and drafts remain owned by the existing Storyroom state.

The Demo badge, persistent database-ready/saved-revision text, fictional-details footer, empty-history guidance, and reply provider/revision captions are removed from the rendered workspace. Actual user messages, saved chat titles, source information, earlier-reply context, actionable errors, and pending work are preserved. These presentation changes do not enable live providers or change the synthetic-data milestone.

Tablet/mobile text inputs and message paragraphs use 16 px text. Chat/Voice, sidebar, and composer controls provide 44 px targets. On phones the manual resolve/reopen action uses a labelled icon, retaining its accessible name and click behaviour.

Verification covers desktop collapse, initial compact navigation, drawer dismissal and focus, breakpoint changes, settings handoff, absent boilerplate, chat switching, persistence, errors, and conversation behaviour. Browser review includes phone, tablet, and desktop widths. Native device keyboards and physical touchscreen behaviour still require device testing.
