# Gym Trainer AI - Development Plan

## 1. Project Overview
**Goal:** Build a browser-based "Gym Trainer" application using the Gemini Live API.
**Core Features:**
1.  **Real-time Multimodal Analysis:** Use Webcam (Video) and Microphone (Audio) to stream data to Gemini.
2.  **Exercise Detection:** AI identifies the exercise being performed.
3.  **Form Correction:** AI provides real-time voice feedback on form.
4.  **Workout Tracking:** App calculates duration of exercises between "Start" and "Stop" commands.
5.  **Persistence:** Store user workout history locally using a proper database structure.

## 2. Technology Stack & Constraints
*   **Platform:** Web Application (AI Studio Host).
*   **Framework:** React 18+ (Functional Components, Hooks).
*   **Styling:** Tailwind CSS.
*   **AI Model:** `gemini-2.5-flash-native-audio-preview-09-2025` (via `@google/genai`).
*   **Persistence:** **IndexedDB** (Browser-native NoSQL Database). This allows for structured, transactional data storage without requiring external cloud credentials (which are restricted).
*   **State Management:** React `useState` / `useReducer` / Context API.
*   **Permissions:** Camera, Microphone.

## 3. Architecture

### 3.1. Data Layer (IndexedDB)
We will implement a `GymDatabase` class/service to manage interactions with IndexedDB.
*   **DB Name:** `GymTrainerDB`
*   **Store:** `sessions`
*   **Schema (TypeScript Interface):**
    ```typescript
    interface WorkoutSession {
      id: string; // UUID
      userId: string;
      startTime: string; // ISO Date
      endTime: string; // ISO Date
      totalDurationSeconds: number;
      exercises: ExerciseLog[];
    }

    interface ExerciseLog {
      name: string;
      startTime: number; // Relative to session start or timestamp
      durationSeconds: number;
      feedback: string[]; // AI comments collected during the set
    }
    ```

### 3.2. Core Components

1.  **`AuthView`**: Simple input to identify the user.
2.  **`DashboardView`**:
    *   Fetches and displays past workout sessions from IndexedDB.
    *   Calculates summary statistics (e.g., "Total Squats Time").
    *   "Start New Session" button.
3.  **`LiveSessionView`**:
    *   **Video/Canvas**: Capture pipeline for Gemini.
    *   **Audio**: Web Audio API context for streaming PCM.
    *   **LiveOverlay**: Displays real-time exercise detection and timer.
    *   **Controls**: End Session (triggers DB save).

### 3.3. AI Implementation Strategy (Gemini Live)

*   **Connection**: WebSockets via `ai.live.connect`.
*   **Tooling**: `report_exercise_status` tool.
*   **Protocol**:
    *   Stream Audio (Input) -> Gemini
    *   Stream Video Frames (Input) -> Gemini
    *   Gemini -> Audio (Output - Voice Feedback)
    *   Gemini -> Tool Call (Output - State Update)

## 4. Development Steps

1.  **Phase 1: Skeleton & Database (Current)**
    *   Implement `GymDatabase` (IndexedDB wrapper).
    *   Create `AuthView` and `DashboardView`.
    *   Ensure data persists across reloads.
2.  **Phase 2: Media Infrastructure**
    *   `useMediaStream` hook for Camera/Mic.
    *   Canvas scaler for video frame capture.
3.  **Phase 3: Gemini Live Client**
    *   Implement connection management.
    *   Audio input/output processing (PCM encoding/decoding).
4.  **Phase 4: Logic Integration**
    *   Connect Live Client tools to React State.
    *   Implement the "Tracking" logic (measuring time between tool calls).
5.  **Phase 5: Final Polish**
    *   Styling and UX improvements.

## 5. Timeline & Milestones
*   [x] **Phase 1: Skeleton**: App renders, DB works, User can see history.
*   [ ] **Phase 2: Live Connection**: Connect to Gemini, stream audio/video.
*   [ ] **Phase 3: Tooling**: Make Gemini recognize exercises and call tools.
*   [ ] **Phase 4: Tracking Logic**: Timer logic and detailed session recording.
*   [ ] **Phase 5: Persistence**: Saving live session data to DB.
