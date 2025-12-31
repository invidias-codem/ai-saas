# Slack Bot Optimization Strategy

## 1. Introduction

The current Genie AI Slack bot is powerful and leverages modern Slack APIs for a solid user experience. This strategy outlines a three-pronged approach to elevate the bot from a reactive tool to a proactive, indispensable team member.

The three pillars of this strategy are:
1.  **Hyper-Personalization & Contextual Awareness**
2.  **Deep Workflow Integration**
3.  **Enhanced User Experience & Discovery**

## 2. Pillar 1: Hyper-Personalization & Contextual Awareness

The goal is to make the bot feel like it knows the user, the channel, and the team's context.

### 2.1. Thread-Level Memory

-   **Current State:** The bot responds to individual messages.
-   **Proposed Enhancement:** Implement thread-level context. When a user replies to a bot message in a thread, the bot should automatically have the context of the previous messages in that thread.
-   **Implementation:**
    -   When responding to a user, store the `thread_ts` along with the message history.
    -   When a new message comes in with a `thread_ts`, retrieve the conversation history for that thread.
    -   Use the `assistant.threads` API more deeply to manage this context.

### 2.2. User-Specific Memory Integration

-   **Current State:** The bot has access to a user's general memory from the web app.
-   **Proposed Enhancement:** Allow the bot to save and recall memories *specifically from Slack*.
-   **Implementation:**
    -   Enhance the "Save" interactive button to save the current Slack message (or thread) to the user's memory.
    -   Add a new slash command: `/genie remember [text]` to explicitly add to memory.
    -   When responding, give higher weight to memories that originated from Slack, especially from the same channel or user.

### 2.3. Channel-Specific Configurations

-   **Current State:** The bot's behavior is the same in all channels.
-   **Proposed Enhancement:** Allow users to set channel-specific configurations.
-   **Implementation:**
    -   Create a new slash command `/genie configure` that opens a modal.
    -   In the modal, allow users to set:
        -   **Persona:** "Code Assistant", "General Assistant", "Marketing Expert", etc.
        -   **Response Style:** "Concise", "Detailed", "Technical".
        -   **Proactive Summaries:** Enable/disable automatic daily or weekly summaries for the channel.
    -   Store these preferences in the `slackUserPreferences` Firestore collection, keyed by channel ID.

## 3. Pillar 2: Deep Workflow Integration

The goal is to move beyond answering questions and start automating tasks and workflows.

### 3.1. Proactive Channel Summaries

-   **Current State:** Users can ask the bot to summarize.
-   **Proposed Enhancement:** The bot can proactively summarize channel activity.
-   **Implementation:**
    -   Use the channel-specific configurations from 2.3.
    -   Create a scheduled Cloud Function that runs daily or weekly.
    -   The function checks which channels have proactive summaries enabled.
    -   For each channel, it fetches the recent message history (using the bot's token), generates a summary using Gemini, and posts it to the channel.

### 3.2. File Attachment Support

-   **Current State:** The bot only processes text.
-   **Proposed Enhancement:** Allow users to upload files (e.g., code files, logs, documents) and ask questions about them.
-   **Implementation:**
    -   Subscribe to the `file_shared` Slack event.
    -   When a file is shared in a DM or a channel where the bot is mentioned, download the file content using the Slack API.
    -   Pass the file content along with the user's prompt to Gemini.
    -   This is a perfect use case for Gemini's multi-modal capabilities.

### 3.3. Workflow Builder Integration

-   **Current State:** Limited integration with external tools (via Zapier on memory creation).
-   **Proposed Enhancement:** Integrate with Slack's Workflow Builder.
-   **Implementation:**
    -   Create custom workflow steps that can be used in Slack's Workflow Builder.
    -   **Example Step 1: "Analyze Text with Genie"**:
        -   Input: A text string.
        -   Output: The analysis from Genie.
    -   **Example Step 2: "Generate Code with Genie"**:
        -   Input: A prompt describing the code to generate.
        -   Output: The generated code.
    -   This will allow users to build powerful, custom workflows directly in Slack, using Genie as a core component.

## 4. Pillar 3: Enhanced User Experience & Discovery

The goal is to make the bot easier and more enjoyable to use, and to help users discover its full potential.

### 4.1. App Home Tab Enhancements

-   **Current State:** The App Home tab is basic.
-   **Proposed Enhancement:** Make the App Home a true dashboard for the user's interaction with Genie.
-   **Implementation:**
    -   Use the `app_home_opened` event to dynamically update the App Home view.
    -   **Dashboard Components:**
        -   List of recent memories from Slack.
        -   Usage statistics.
        -   A prominent "Ask Genie" input box.
        -   A list of suggested prompts (leveraging `assistantHelpers.ts`).
        -   A "What's New" section to announce new features.

### 4.2. Better Onboarding for New Users

-   **Current State:** Users are expected to know how to use the bot.
-   **Proposed Enhancement:** Provide a guided onboarding experience for new users.
-   **Implementation:**
    -   When a new user interacts with the bot for the first time (e.g., in a DM), send a welcome message with a quick tutorial.
    -   Use interactive buttons to guide them through their first command (e.g., "Try asking me a question", "See your stats").
    -   Use the `setSuggestedPrompts` helper to provide initial guidance.

### 4.3. Streaming and Richer Responses

-   **Current State:** The bot already uses streaming.
-   **Proposed Enhancement:** Double down on streaming and make responses richer.
-   **Implementation:**
    -   Ensure streaming is used for *all* generative responses, including from slash commands.
    -   Use the `assistant.threads.setStatus` feature more creatively. For example, when generating code, the status could be "Writing function...", "Adding comments...", "Done!".
    -   For complex responses, use Slack's Block Kit to structure the information with sections, dividers, and even images or charts where appropriate.

## 5. Implementation Roadmap

This strategy can be implemented in phases.

-   **Phase 1 (Short-Term):**
    -   Thread-Level Memory (2.1)
    -   App Home Tab Enhancements (4.1)
    -   Better Onboarding (4.2)

-   **Phase 2 (Mid-Term):**
    -   User-Specific Memory Integration (2.2)
    -   File Attachment Support (3.2)
    -   Proactive Channel Summaries (3.1)

-   **Phase 3 (Long-Term):**
    -   Channel-Specific Configurations (2.3)
    -   Workflow Builder Integration (3.3)

By following this strategy, we can make the Genie AI Slack bot an indispensable tool that is proactive, personalized, and deeply integrated into the user's workflow.
