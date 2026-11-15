# TaskFlow — Task & Timeline Manager

A lightweight task manager for tracking multiple tasks with owners, priorities, statuses and timelines.
Plain HTML/CSS/JavaScript — no build step, no dependencies — so it deploys to Vercel straight from GitHub.

## Features
- **Three views:** List (sortable table), Board (drag cards between To do / In progress / Blocked / Done), and **Timeline** (Gantt chart with a "today" line, grouped by project, zoom by days / weeks / months)
- Each task has: title, description, project, owner, start date, due date, status, priority, % progress
- Dashboard counters: total, in progress, due in 7 days, overdue, % completed
- Search + filter by project, status and priority; overdue tasks are highlighted in red
- Export / Import as JSON (for backups or moving to another browser)
- Light & dark mode (follows your system), mobile friendly, press **N** to add a task

## Project structure
```
index.html   – page layout and the add/edit task form
styles.css   – all styling
app.js       – app logic (storage, views, timeline, drag & drop)
vercel.json  – Vercel config (clean URLs + security headers)
```

## Run locally
Just open `index.html` in your browser. (Or run `npx serve .` and open the URL it prints.)

## Deploy: GitHub → Vercel
1. Create a new repository on GitHub (e.g. `taskflow`).
2. Upload these files — either drag them into GitHub's **Add file → Upload files** page, or:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/taskflow.git
   git push -u origin main
   ```
3. Go to <https://vercel.com/new>, sign in with GitHub and **Import** the repository.
4. Framework preset: **Other**. Leave Build Command and Output Directory empty. Click **Deploy**.
5. Done — every future push to `main` redeploys automatically.

## Where is my data stored?
Tasks are saved in your browser's `localStorage`. That means:
- Data stays on the device/browser you used — it does **not** sync between your laptop and phone.
- Clearing browser data deletes your tasks, so use **Export** regularly as a backup.

If you later need shared/team access or syncing across devices, the next step is to add a database
(e.g. Supabase or Vercel's Postgres/KV marketplace integrations) plus login. The data model in `app.js`
is already a simple array of task objects, so it maps directly to a database table.
