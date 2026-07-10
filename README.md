# TaskFlow Task & Productivity Manager - GitHub Deployment Guide

This project is a modern React SPA (Single Page Application) styled with Tailwind CSS, supporting local productivity tracking, robust data backup/snapshots, AI productivity reporting (integrated with Gemini), and Telegram system alert delivery.

This guide provides step-by-step instructions for hosting and deploying this application directly on **GitHub Pages**.

---

## 🚀 Quick Setup for GitHub Pages

### Step 1: Create a GitHub Repository
1. Log in to your GitHub account.
2. Create a new repository (e.g., named `taskflow`). Keep it **Public** (required for free GitHub Pages).
3. Do **not** initialize it with a README, `.gitignore`, or license.

### Step 2: Push Your Code to GitHub
Open your terminal in the project directory and run the following commands to initialize Git and push the project to your new repository:

```bash
# Initialize git repository
git init

# Add all files to staging
git add .

# Create the initial commit
git commit -m "feat: configure GitHub Pages and offline-first client-side fallbacks"

# Rename current branch to main
git branch -M main

# Link your local repo to GitHub (replace with your repository's URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Push your code to GitHub
git push -u origin main
```

---

## 🛠️ Automated Deployment via GitHub Actions

We have included a GitHub Actions workflow in `.github/workflows/deploy.yml`. When you push code to the `main` or `master` branch, GitHub will automatically build your app and deploy it!

### Step 3: Enable Workflow Permissions
To allow the GitHub Action to publish your site:
1. Go to your repository on GitHub.
2. Click on **Settings** -> **Actions** -> **General**.
3. Scroll down to **Workflow permissions** and select **Read and write permissions**.
4. Click **Save**.

### Step 4: Configure GitHub Pages Publishing
Once the automatic build completes (you can watch it in the **Actions** tab of your repository):
1. Go to **Settings** -> **Pages** in your GitHub repository.
2. Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
3. Under **Branch**, select `gh-pages` and `/ (root)`, then click **Save**.
4. Within 1-2 minutes, GitHub will provide a live link (e.g., `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`) where your application is hosted!

---

## 🌐 Dual-Mode & Client-Side Resiliency

This app is built with **full-stack resiliency**:
* **Server-Side Mode (Local/Cloud Run)**: Uses the bundled Express server (`server.ts`) as a secure proxy to send Telegram alerts and invoke the Gemini AI model.
* **Static Client-Side Mode (GitHub Pages)**: Since GitHub Pages hosts static files (without a Node.js backend running), the application automatically detects this and falls back to **direct browser-to-API requests**:
  * **Telegram Alerts**: Directly dispatched to the Telegram Bot API from the browser.
  * **Gemini AI Reports (Khmer/English)**: Directly processed via the Google Generative Language REST endpoints using the custom Gemini API key configured in the **AI Settings** modal of your app.
