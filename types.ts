
export interface ExerciseLog {
  name: string;
  durationSeconds: number;
  reps: number;
  feedback: string[];
}

export interface WorkoutSession {
  id: string;
  userId: string;
  date: string; // ISO String
  totalDurationSeconds: number;
  exercises: ExerciseLog[];
}

export interface UserProfile {
  userId: string;
  displayName: string;
  birthday: string;
  interests: string;
  goals: string;
  expertSuggestions: string; // AI generated advice
  lastAnalysisDate: string;
}

export type ViewState = "auth" | "dashboard" | "live" | "profile" | "chat";
