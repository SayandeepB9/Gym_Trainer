# AI Gym Trainer - Technical Documentation

An advanced browser-based Personal Trainer application powered by Google's Gemini Multimodal Live API. This application provides real-time form correction, rep counting, and personalized workout strategy analysis using pure client-side technologies.

## 🌟 Key Features

*   **Real-time Multimodal Analysis**: Streams user webcam (video) and microphone (audio) to Gemini to detect exercises and assess form instantly.
*   **Interactive Voice Feedback**: The AI counts reps out loud and provides correcting cues ("Lower your hips", "Chest up") with low latency.
*   **Exercise State Tracking**: Automatically logs sets, reps, and durations without manual input.
*   **Strategic Profile Analysis**: Analyzes workout history using `gemini-2.5-flash` to generate personalized "Gym Expert Strategies" stored as structured JSON.
*   **Contextual Chat**: Integrated RAG-like chat using `gemini-3-pro-preview` with Google Search grounding to answer questions based on the user's specific workout history.
*   **Offline-First Persistence**: Uses **IndexedDB** for full data privacy and persistence without a backend server.

---

## 🏗 Architecture & Tech Stack

### Frontend
*   **Framework**: React 18 (Functional Components, Hooks)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS (via CDN)
*   **Build/Runtime**: ES Modules (native browser support via `importmap`)

### AI & SDKs
*   **SDK**: `@google/genai` (v1.32.0+)
*   **Live Model**: `gemini-2.5-flash-native-audio-preview-09-2025` (Audio/Video Streaming)
*   **Analysis Model**: `gemini-2.5-flash` (Text/JSON Generation)
*   **Chat Model**: `gemini-3-pro-preview` (Reasoning + Search Grounding)

### Persistence
*   **Database**: IndexedDB (Browser Native NoSQL)
*   **Stores**: 
    *   `sessions`: Stores complete workout logs.
    *   `profiles`: Stores user metadata and AI-generated strategies.

---

## 🔌 Technical Deep Dive

### 1. Live API Pipeline (`LiveSessionView.tsx`)

The core of the application relies on a WebSocket connection to the Gemini Live API.

**Audio Input (Mic -> Model):**
*   **Source**: `navigator.mediaDevices.getUserMedia` (16kHz, Mono).
*   **Processing**: `ScriptProcessorNode` (Buffer Size 4096).
*   **Format**: Raw Float32 PCM is converted to **16-bit PCM** (Little Endian) before being base64 encoded.
*   **Transmission**: Sent via `session.sendRealtimeInput` continuously.

**Video Input (Camera -> Model):**
*   **Source**: `<video>` element feed.
*   **Processing**: Canvas API draws frames at **5 FPS** (200ms interval).
*   **Format**: JPEG images (base64 encoded).
*   **Optimization**: Images are resized to **512x288** to balance latency and recognition accuracy.

**Audio Output (Model -> Speakers):**
*   **Format**: Raw 16-bit PCM at **24kHz**.
*   **Buffering**: Chunks are received via `onmessage`, decoded to `Float32`, and scheduled for playback using the Web Audio API (`AudioBufferSourceNode`) to ensure gapless playback.

**Tool Use (State Management):**
*   The model has access to `report_exercise_status`.
*   **Trigger**: The AI calls this function when it detects a completed rep or a form error.
*   **Handling**: The client executes the function, updates the React state (Reps UI, Feedback Text), and tracks "Exercise Segments" (Start Time -> End Time) to calculate duration.

### 2. Data Persistence (IndexedDB)

The app uses a custom `GymDatabase` class wrapper around `IDBRequest` API.

**Schema:**
```typescript
interface WorkoutSession {
  id: string;        // UUID
  userId: string;    // Foreign Key
  date: string;      // ISO 8601
  totalDurationSeconds: number;
  exercises: {
    name: string;
    reps: number;
    durationSeconds: number;
    feedback: string[];
  }[];
}
```

### 3. Contextual Analysis Engine

**Profile Analysis:**
*   **Trigger**: After every saved session.
*   **Input**: User goals + Full workout history text summary.
*   **Output**: Structured JSON via `responseSchema`.
*   **Use Case**: Updates the "Gym Expert Strategy" on the dashboard.

**Chat (RAG-Lite):**
*   **Context Injection**: The entire workout history is formatted as a text prompt and injected into the system instruction.
*   **Grounding**: Uses `googleSearch` tool to find YouTube videos for exercise demonstrations if requested.

---

## 📂 File Structure

```
/
├── index.html            # Entry point, import maps, Tailwind CDN
├── index.tsx             # Main routing logic (View Switcher)
├── types.ts              # TypeScript interfaces (Session, Profile, etc.)
├── db.ts                 # IndexedDB abstraction layer
├── utils.ts              # Audio PCM encoding/decoding utilities
├── LiveSessionView.tsx   # CORE: Camera/Mic handling & Gemini Live connection
├── DashboardView.tsx     # Stats, History List, Strategy Display
├── ChatView.tsx          # Text chat with Gemini 3 Pro
├── ProfileView.tsx       # User settings form
├── AuthView.tsx          # Simple username entry
├── trainer_prompt.txt    # System instructions for the Live Trainer
├── expert_prompt.txt     # System instructions for the Profile Analyst
├── chat_prompt.txt       # System instructions for the Chat Bot
└── metadata.json         # Permission requests (Camera/Mic)
```

## ⚠️ Requirements & Limitations

1.  **Browser**: Requires a modern browser with Web Audio API and Canvas API support (Chrome/Edge recommended).
2.  **API Key**: Must be provided via environment variable `API_KEY`.
3.  **Latency**: Performance depends heavily on internet upload speed (for video frames).
4.  **Cost**: Uses Gemini 2.5 Flash Native Audio Preview which is a paid/preview API.
5.  **Single Device**: IndexedDB data is local to the specific browser instance and does not sync across devices.
