# Workflow Studio

Dashboard: **Workflow Studio** (sidebar under Projects).

## Features

- **Projects**: Create named workflow projects; each stores a canvas layout (nodes + edges).
- **GitLab**: Optional `group/repo` path per project (link to your existing GitLab project). The **repo dropdown** loads from `GET /api/gitlab/repos` (requires `GITLAB_TOKEN` + `GITLAB_NAMESPACE`).
- **AI draft flow**: Pick a repo (or type `group/repo`), then **✨ AI draft flow**. The server fetches the default branch + file tree (+ README/package excerpts), runs the AI, and lays out nodes/edges with rationale (including when duplicate agents of the same type are justified).
- **Agents**: Drag agents from the palette onto the canvas. You can place multiple instances of the same role (e.g. two Backend Dev nodes).
- **Flow diagram**: Drag from the **orange output** port (right) on one node to the **gray input** port (left) on another — dashed wire while dragging, solid edge when you release on an input. Edge endpoints use the port elements so lines stay aligned when you move nodes (`ResizeObserver` + redraw).
- **Team meeting (roundtable)**: Chat with **multiple agents at once** — they reply in **fixed order** (orchestrator → … → reporter) with facilitator rules so they **don’t talk over each other** (one turn each, no cross-talk). Pick who speaks with checkboxes; **Match canvas** matches the checkboxes to agent types on your flow. Replies appear as staggered bubbles. **⌘/Ctrl+Enter** sends. **Shareable voice link** creates a token and opens the full **meeting room** page (Jitsi + voice AI) — same flow as Telegram `/meeting`.
- **Transcript summary**: Paste a long meeting transcript below the divider; **Summarize transcript** returns one Markdown summary plus next steps (unchanged).

## Data

- Stored in `data/workflow-projects.json` on the server.

## Zoom / live voice (future)

- **Today**: Roundtable chat → `/api/meeting/roundtable` · paste transcript → `/api/meeting/transcript`.
- **Next steps**: Zoom OAuth + webhooks; optional **real-time voice** with STT → roundtable; **per-agent avatars** and TTS for each reply.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflow-projects` | List projects |
| POST | `/api/workflow-projects` | Create `{ name, gitlabPath?, nodes?, edges? }` |
| PUT | `/api/workflow-projects/:id` | Update `{ name?, gitlabPath?, nodes, edges }` |
| DELETE | `/api/workflow-projects/:id` | Delete |
| POST | `/api/meeting/transcript` | `{ text, context? }` → `{ reply }` |
| POST | `/api/meeting/roundtable` | `{ message, context?, agents?: string[], history? }` → `{ turns: [{ agentType, label, content, turn }] }` |
| POST | `/api/meeting/sessions` | (auth) Create token → `{ meetingRoomUrl, jitsiUrl, token, expiresAt }` |
| GET | `/api/meeting/session/:token` | (public) Validate token → Jitsi URL + room metadata |
| POST | `/api/meeting/session/:token/roundtable` | (public) Same as roundtable, gated by session token (for `meeting-room.html` without login) |
| POST | `/api/meeting/sessions/internal` | Bot only: header `X-Meeting-Secret: MEETING_INTERNAL_SECRET` |
| GET | `/api/gitlab/repos` | List repos in configured namespace |
| POST | `/api/workflow-projects/draft-from-repo` | `{ gitlabPath }` → `{ nodes, edges, summary, rationale, stackHints }` |

## Requirements for GitLab + AI draft

- `GITLAB_TOKEN` (API scope: read repository / api as needed for your instance).
- `GITLAB_NAMESPACE` (group or user path used to list repos).
- AI provider env vars as for the rest of the dashboard (same `aiClient` as other features).
