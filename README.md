# astroKapsel by @floherzler

Citizen-science storytelling for comets, built for the **Appwrite Hacktoberfest Hackathon 25**. astroKapsel invites visitors to explore the rhythm of periodic (P-type) comets alongside the once-in-a-lifetime brilliance of long-period and hyperbolic (C-type) visitors. The site frames each interaction as a calm observatory experience—highlighting scientific context, curated historical references, and AI-assisted narratives that help spark curiosity without pretending to be definitive science.

## Project Intent

- **Inspiration-first** – Summaries, captions, and imagery are generated with AI (Gemini 2.5 Flash Lite + local imagers), clearly labeled so visitors know they are prompts for deeper study—not final research outputs.
- **Citizen-science storytelling** – The interface walks users through why periodic comets matter for solar-system dynamics and why single-visit comets capture cultural imagination. Users can add their own tracked objects and generate observational briefings.
- **Narrative UI** – The landing page doubles as a guided briefing, contrasting “Periodic • Heartbeat of Time” with “Single Visit • Spike of Wonder.” Fleet lists, orbit diagrams, and resource panels reinforce that this is a collaborative observatory rather than a static database.

## Architecture at a Glance

- **Single repository** – One GitHub repo contains the complete stack: Next.js site under `src/`, Appwrite Functions in `functions/`, and Appwrite database configuration via scripts. No split repos were used for infrastructure, backend, or frontend.
- **Appwrite platform** – Tables store comet metadata, sightings, and user submissions; Functions trigger Gemini-based generation; the site is deployed as an Appwrite Site.
- **UI foundation** – React Server Components with Tailwind CSS + shadcn/ui primitives, tuned to feel like a quiet mission console while remaining accessible.

## AI-Agent Development Workflow

This project doubled as an experiment in running an **AI agent-first build**. The entire implementation was scaffolded, staged, and refined using the OpenAI Codex VSCode extension (paired with the Codex CLI). Human intervention focused on touch-ups, bug triage, and aligning tone.

**What worked well**

- Rapid iteration: The agent produced large layout refactors, Appwrite query boilerplate, and Gemini integration stubs far faster than manual coding.
- Narrative coherence: By prompting the agent with mission-language guidelines, the resulting UI stayed consistent with the “observatory voice.”

**What I learned / will change next time**

1. **Plan more up front** – Even with an agent, having page-flow wireframes and API payload sketches would have prevented me from revisiting the same sections multiple times.
2. **Deepen Tailwind/shadcn literacy** – The agent reintroduced spacing and component mismatches (e.g., duplicate sliders, uneven grids). Understanding the design system fundamentals myself will reduce cleanup.
3. **Watch for repeated Appwrite mistakes** – The agent occasionally generated queries or permission calls that Appwrite rejects. Each fix cost time; a checklist of “known gotchas” will help future runs.

Despite the rework, the agent-driven approach still saved significant research and setup hours.

## Feature Highlights

- **Your Comet Fleet** – Categorised lists with scientific badges (period, perihelion date, hyperbolic status, etc.) plus a 3D Three.js orbit console.
- **Great Comet Lab** – AI-generated observation notes anchored to archival perihelion data, expandable ledger entries, and historical resource links.
- **Mission resources** – Reference lists for great comets, educational videos, and podcasts to deepen community learning.
- **Appwrite integration** – Live data retrieved from Appwrite’s database, with new sightings persisted via Functions that call Gemini and append to the ledger.

## Getting Started

```bash
pnpm install
pnpm dev
```

Configure Appwrite environment variables (database IDs, function IDs, etc.) in `.env`. One repository houses everything, so deploying to an Appwrite project immediately exposes the Functions and Site assets.

## Acknowledgements

- Built with Appwrite, Next.js, Tailwind CSS, shadcn/ui, and Gemini 2.5 Flash Lite.
- Developed primarily through OpenAI’s Codex extension inside VSCode as part of an AI-agent workflow experiment.

astroKapsel remains an inspirational citizen-science companion—inviting observers to log, imagine, and learn alongside AI-generated context while keeping the human scientist firmly in the loop.
