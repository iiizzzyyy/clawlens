# ClawLens Demo Video Script

**Format:** Screen recording with voiceover
**Length:** 75–90 seconds (up to ~105 with end card)
**Audience:** OpenClaw developers who want better debugging and observability for their agents
**Structure:** Problem-first arc — hook with the pain, show ClawLens solving it, end with install CTA

---

## Scene 1: Hook (0:00 – 0:08)

**Screen:** Quick cuts between a terminal showing scrolling OpenClaw logs and a `grep` command returning hundreds of matches.

**Voiceover:**
> "Your agent burned fifty dollars in tokens. You're staring at JSONL files trying to figure out why."

**Direction:** Fast-paced, 2 quick cuts (~4 seconds each). Evoke recognition.

---

## Scene 2: Intro (0:08 – 0:15)

**Screen:** ClawLens logo/title card (white on dark, 2 seconds), then cut to the Bots Dashboard loading.

**Voiceover:**
> "ClawLens is the investigation layer for OpenClaw — every session, LLM call, and tool execution captured automatically."

---

## Scene 3: Bots Dashboard (0:15 – 0:25)

**Screen:** Bots Dashboard — slowly hover over agent cards. Show sparklines animating, status badges (Working/Idle), delegation relationships. The sessions list should be visible with many rows when clicking through.

**Voiceover:**
> "The Bots Dashboard shows every agent at a glance — status, token trends, cost, and delegation relationships. Spot the problem in seconds."

**Actions to capture:**
- Mouse hovers over 2–3 agent cards
- Switch date range from "24h" to "30d" to show stats growing (more impressive direction)

---

## Scene 4: Session Replay + Export (0:25 – 0:45)

**Screen:** Click an agent card → Sessions list (filtered, showing many rows — brief pause to convey data volume) → click a session → Replay page. Expand a turn, show tool waterfall, scroll to show cost bar. Then click the Export button to show the HTML download.

**Voiceover:**
> "Drill into any session and replay it turn by turn. See what the agent said, which tools it called, how long each step took, and what it cost. Export any session as self-contained HTML to share in bug reports or Slack."

**Actions to capture (allow ~20 seconds):**
1. Click agent card → sessions list appears filtered (pause 1–2s to show row count)
2. Click a session row → replay loads
3. Click a turn to expand it → tool waterfall appears
4. Scroll to show 2–3 turns with the running cost bar
5. Click Export button → show download completing

**Direction:** This is the hero feature — give it the most screen time. Speed up mouse travel between clicks in post, but let the turn expansion and export breathe.

---

## Scene 5: Analytics (0:45 – 0:55)

**Screen:** Analytics page — show the "Cost by Agent + Model" and "Tool Failure Rate" charts with data. Briefly scroll to show more cards.

**Voiceover:**
> "Cross-session analytics answer the bigger questions. Which agent-model combo is burning money? Which tool fails the most? Where do retries cluster?"

**Actions to capture:**
- Page loads with charts visible
- Slow scroll to reveal Tool Failure Rate and Retry Clustering charts

---

## Scene 6: Live Flow (0:55 – 1:05)

**Screen:** Live Flow dashboard — stats strip, agent cards, event feed scrolling. Click an event to show the detail panel.

**Voiceover:**
> "Monitor agents in real time with Live Flow. Per-agent stats, enriched event feed, and one-click filtering down to any agent, session, or span type."

**Actions to capture:**
- Live Flow page loads with events streaming
- Click an event row → detail panel appears with span info and action buttons

---

## Scene 7: Close + CTA (1:05 – 1:20)

**Screen:** Terminal showing the install commands typing out:

```
git clone https://github.com/iiizzzyyy/clawlens.git
cd clawlens
pnpm install && pnpm deploy:openclaw
```

Then cut to the ClawLens UI loading in a browser.

**Voiceover:**
> "ClawLens runs as an OpenClaw plugin. No Docker, no separate services. Clone, install, deploy — and it backfills your existing session history automatically. Stop guessing. Start investigating."

**End card:** GitHub URL centered, ClawLens logo above, "Built for the OpenClaw community — Apache 2.0" below. Hold for 3 seconds.

---

## Recording Checklist

Before recording, make sure:

- [ ] OpenClaw is running with real agent data (not demo mode — real data looks more compelling). Scrub any sensitive channel names, user messages, or API keys visible in real data before recording.
- [ ] At least 2–3 agents have recent activity visible on the Bots Dashboard
- [ ] A session exists with multiple turns, tool calls, and visible cost data (use "Last 30 days" if recent data lacks cost)
- [ ] Live Flow has events flowing (send a message on a channel right before recording)
- [ ] *(Optional)* Cron Jobs page has at least one job with run history — not shown in a scene but useful for a flash cut
- [ ] Browser: Chrome recommended. Dark mode, full-screen, no bookmarks bar, no other tabs, console/devtools closed, dock hidden
- [ ] Screen resolution is 1920x1080 or 2560x1440 (record at native, export at 1080p)
- [ ] Export action in Scene 4 will trigger a download — configure browser to suppress the download bar or plan to crop in post
- [ ] Voiceover microphone is tested — quiet room, no echo

## Post-Production Notes

- **Music:** Optional subtle background track (lo-fi or ambient). Keep it low — the voiceover carries the video.
- **Transitions:** Simple cuts between scenes. No fancy transitions — they feel corporate. A brief fade to black between Hook and Intro is fine.
- **Text overlays:** Feature name as a small lower-third label when each section starts (e.g., "Bots Dashboard", "Session Replay"). Keep it subtle.
- **Speed:** If the recording runs long, speed up mouse movements and page loads to 1.5–2x. Never speed up the voiceover.
- **End card:** Include the GitHub URL as a clickable annotation if the platform supports it.

## Where to Host

- **GitHub README:** Embed as a GIF (muted, no audio) or link to YouTube/Loom
- **YouTube:** Full version with voiceover for discoverability
- **Twitter/X:** 60-second cut (trim Scene 6 if needed to fit)
- **OpenClaw Discord:** Share the YouTube link with a brief intro
