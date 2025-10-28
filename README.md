# Genie AI 🧞‍♂️

Genie is an all-in-one AI assistant platform built with Next.js, Clerk, and various generative AI models. It provides a comprehensive suite of tools for content creation, code assistance, and more, all within a sleek, modern interface.

## Features ✨

  * **Conversation:** A ChatGPT-like interface powered by Google's Gemini model for general-purpose Q\&A.
  * **Code Genie:** An AI coding assistant, also using Gemini, that can analyze code, answer programming questions, and generate new code snippets.
  * **Image Capsule:** Generate high-resolution images from text prompts using Replicate's Seedream model.
  * **Quick Clip:** Create short videos from text prompts using Replicate's Veo-3 model.
  * **Juke Box:** Generate music and audio clips from text prompts using Replicate's MusicGen model.
  * **Secure Authentication:** User sign-up, sign-in, and profile management handled by Clerk.
  * **Modern UI:** Built with Shadcn UI and Tailwind CSS for a beautiful, responsive, and theme-aware (dark/light mode) experience.

## Tech Stack

  * **Framework:** [Next.js](https://nextjs.org/) (App Router)
  * **Authentication:** [Clerk](https://clerk.com/)
  * **UI:** [Shadcn UI](https://ui.shadcn.com/) & [Tailwind CSS](https://tailwindcss.com/)
  * **AI Models:** [Google Gemini](https://ai.google.dev/) & [Replicate](https://replicate.com/)
  * **Validation:** [Zod](https://zod.dev/)
  * **Database:** [Firebase Firestore](https://firebase.google.com/docs/firestore)

## Getting Started

Follow these instructions to set up and run the Genie AI project on your local machine.

### 1\. Prerequisites

  * Node.js (v18 or later)
  * A package manager (npm, yarn, or pnpm)
  * Access keys for:
      * Clerk
      * Replicate
      * Google AI (Gemini)
      * Google Cloud (for Firebase and Vertex AI)

### 2\. Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/your-username/genie-ai.git
    cd genie-ai
    ```

2.  Install the dependencies:

    ```bash
    npm install
    ```

### 3\. Environment Variables

This is the most important step. Your `lib/env.ts` file uses Zod to validate your environment variables. The app will not build or run unless all required variables are present.

1.  Create a new file in the root of your project named `.env.local`:

    ```bash
    touch .env.local
    ```

2.  Copy and paste the following into your `.env.local` file, replacing all placeholder values with your actual keys.

    ```env
    # Clerk Authentication
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
    CLERK_SECRET_KEY=sk_...
    NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
    NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
    NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
    NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/

    # AI Model Keys (Server-side)
    GOOGLE_API_KEY=AIza...
    REPLICATE_API_TOKEN=r8_...

    # Google Cloud & Vertex AI
    GOOGLE_PROJECT_ID=your-gcp-project-id
    GOOGLE_LOCATION=us-central1

    # This must be the entire JSON object from your service account key, in a single line.
    GCP_SERVICE_ACCOUNT_KEY_JSON={"type":"service_account",...}
    ```

    **Note on `GCP_SERVICE_ACCOUNT_KEY_JSON`:** You must paste the *entire content* of your Google Cloud service account JSON key file as a single line (with `\n` characters preserved inside the private key string).

### 4\. Run the Development Server

Once your `.env.local` file is set up, you can start the server:

```bash
npm run dev
```

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) with your browser to see the result.

## Deploy on Vercel

The easiest way to deploy this Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

**IMPORTANT:** Before deploying, make sure you have added all the environment variables from your `.env.local` file to your Vercel project's **Settings \> Environment Variables** page. The build will fail without them.
