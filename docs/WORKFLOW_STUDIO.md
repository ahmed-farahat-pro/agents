# Workflow Studio

Dashboard: **Workflow Studio** (sidebar under Projects).

## Features

- **Projects**: Create named workflow projects; each stores a canvas layout (nodes + edges).
- **GitLab**: Optional `group/repo` path per project (link to your existing GitLab project). The **repo dropdown** loads from `GET /api/gitlab/repos` (requires `GITLAB_TOKEN` + `GITLAB_NAMESPACE`).
- **AI draft flow**: Pick a repo (or type `group/repo`), then **✨ AI draft flow**. The server fetches the default branch + file tree (+ README/package excerpts), runs the AI, and lays out nodes/edges with rationale (including when duplicate agents of the same type are justified).
- **Agents**: Drag agents from the palette onto the canvas. You can place multiple instances of the same role (e.g. two Backend Dev nodes).
- **Flow diagram**: Enable **Connect nodes**, then click two agent nodes to draw a curved edge (n8n-style flow).
- **Meetings**: Paste a meeting transcript (Zoom, Google Meet, Teams, or notes). The server calls your configured AI model to return a **text** summary and suggested next steps for the agent team.

## Data

- Stored in `data/workflow-projects.json` on the server.

## Zoom / live voice (future)

- **Today**: Paste transcript or type notes → `/api/meeting/transcript`.
- **Next steps**: Zoom OAuth app + webhook for `recording.transcript_completed`, or Zoom Meeting SDK for in-browser audio; pipe STT text to the same endpoint.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workflow-projects` | List projects |
| POST | `/api/workflow-projects` | Create `{ name, gitlabPath?, nodes?, edges? }` |
| PUT | `/api/workflow-projects/:id` | Update `{ name?, gitlabPath?, nodes, edges }` |
| DELETE | `/api/workflow-projects/:id` | Delete |
| POST | `/api/meeting/transcript` | `{ text, context? }` → `{ reply }` |
| GET | `/api/gitlab/repos` | List repos in configured namespace |
| POST | `/api/workflow-projects/draft-from-repo` | `{ gitlabPath }` → `{ nodes, edges, summary, rationale, stackHints }` |

## Requirements for GitLab + AI draft

- `GITLAB_TOKEN` (API scope: read repository / api as needed for your instance).
- `GITLAB_NAMESPACE` (group or user path used to list repos).
- AI provider env vars as for the rest of the dashboard (same `aiClient` as other features).
