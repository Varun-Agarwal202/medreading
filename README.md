## Medical Reading Test Generator (Local)

This is a small local web app that:

- loads the 5 book PDFs in this folder
- extracts **text** (page-by-page) and optional **page images**
- generates **lots of in-depth multiple-choice questions per book**

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```bash
cp .env.example .env
```

3. Put your API key in `.env`:

```bash
GEMINI_API_KEY=...
```

Model note: if you get a “model not found / not supported” error, try one of these in `.env`:

- `GEMINI_MODEL=gemini-flash-latest`
- `GEMINI_MODEL=gemini-2.5-flash`
- `GEMINI_MODEL=gemini-2.5-flash-lite`
- `GEMINI_MODEL=gemini-2.5-pro`

### Run

```bash
npm run dev
```

Then open `http://localhost:5173`.

### Notes

- If you want more coverage, increase **Questions per book** (up to 200).
- If you want questions from diagrams/tables, increase **Page image sampling** (but it will take longer and cost more).

## Deploy to Vercel

This repo is compatible with Vercel using **API routes** (`/api/*`). Do **not** deploy your `.env`.

### Steps

1. Push this folder to GitHub (make sure `.env` is not committed).
2. In Vercel, import the repo.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `GEMINI_API_KEY` (required)
   - `GEMINI_MODEL` (optional, recommended: `gemini-1.5-flash`)
4. Deploy.

### Debug model availability

If generation fails with "model not found", visit `/api/models` on your deployed site to see which model strings your key supports, then set `GEMINI_MODEL` accordingly.

### PDFs

Vercel serves static files from `public/`. For the PDFs to load in production, put the 5 PDFs in:

`public/books/`

and make sure their filenames match the `pdfFilename` values returned by `/api/books`.

