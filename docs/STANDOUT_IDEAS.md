# Ideas to make Nigents stand out

Short product and engineering directions beyond the current dashboard + agents.

## Product & UX

1. **Run the workflow from the canvas** — One click “Execute pipeline”: agents run in graph order with real GitLab branches/MRs, status on each node.
2. **Live meeting room** — ✅ **Shipped (v1):** `/meeting` in Telegram → dashboard **meeting-room.html** + Jitsi + Web Speech STT/TTS. Optional: streaming STT (Whisper/Deepgram) + “raise hand”.
3. **Memory per project** — Vector store of decisions + ADRs so agents don’t contradict last week’s meeting.
4. **Diff-aware review** — Code Reviewer agent opens the actual MR diff from GitLab and comments inline.
5. **Cost & SLA dashboard** — Tokens per agent, per project; budgets and alerts.

## Integrations

6. **Slack / Teams** — Post roundtable summaries and “agent blocked” pings to a channel.
7. **CI/CD** — QA agent triggers pipelines; Reporter posts release notes to GitLab Releases.
8. **Linear / Jira** — Planner creates tickets from meeting action items with trace IDs.

## Trust & safety

9. **Human-in-the-loop gates** — Orchestrator proposes; human approves before merge or deploy.
10. **Audit log** — Who said what, which model, which prompt hash (for regulated teams).

## Technical depth

11. **True multi-agent** — Optional mode: each agent runs as a **separate LLM call** with prior messages as context (slower, more “personality”).
12. **Local / private models** — Ollama or vLLM for air-gapped GitLab.

---

*Implemented now: roundtable meeting with **orchestrated turns** and interactive chat UI (`/api/meeting/roundtable`).*
