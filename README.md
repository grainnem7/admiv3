# ADMIv3

This repository contains ADMIv3 — a browser-based interactive mapping/music project built with TypeScript and Vite.

## Quick start

- Install dependencies:

```
npm install
```

- Run development server:

```
npm run dev
```

- Build for production:

```
npm run build
```

- Run tests (if present):

```
npm test
```

## Create a GitHub repository and push

Option A — using the GitHub CLI (`gh`) (recommended):

Replace `OWNER/REPO` with your GitHub username and desired repo name, or omit `OWNER/REPO` to create under your account.

```powershell
git init
git add .
git commit -m "Initial commit"
# create repo and push (interactive or pass --public/--private)
gh repo create OWNER/REPO --public --source=. --remote=origin --push
```

Option B — create repo on GitHub.com and push manually:

1. Create a new repository on https://github.com/new (do not initialize with README).
2. Then run:

```powershell
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## CI

This repo contains a GitHub Actions workflow at `.github/workflows/nodejs.yml` that installs dependencies and runs `npm run build` and `npm test` if those scripts are defined in `package.json`.

## License

This project is licensed under the MIT License — see `LICENSE`.

---
If you want, I can also create the remote for you (requires `gh` + authentication) and push the repo. Tell me which GitHub owner/repo name to use.
