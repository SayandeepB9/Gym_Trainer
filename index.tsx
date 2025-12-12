
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ViewState, WorkoutSession, UserProfile } from "./types";
import { db } from "./db";
import { AuthView } from "./AuthView";
import { DashboardView } from "./DashboardView";
import { LiveSessionView } from "./LiveSessionView";
import { ProfileView } from "./ProfileView";
import { ChatView } from "./ChatView";
import { GoogleGenAI, Type, Schema } from "@google/genai";

const App = () => {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("auth");
  const [currentProfile, setCurrentProfile] = useState<UserProfile | undefined>();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Load Data Effect
  useEffect(() => {
    if (currentUser) {
      db.getProfile(currentUser).then(setCurrentProfile);
      db.getSessions(currentUser).then(setSessions);
    }
  }, [currentUser, view]);

  // AI Logic for Analysis
  const generateExpertSuggestions = async (profile: UserProfile, history: WorkoutSession[]): Promise<string> => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const promptResponse = await fetch("expert_prompt.txt");
      const systemInstruction = await promptResponse.text();

      // Format full session history for the AI Expert
      const historyContext = history.map((s) => {
          const date = new Date(s.date).toLocaleString();
          const duration = `${Math.floor(s.totalDurationSeconds / 60)}m ${s.totalDurationSeconds % 60}s`;
          
          const exercisesList = s.exercises.map(e => 
              `   - ${e.name}: ${e.reps} reps, ${e.durationSeconds}s duration. Feedback: [${e.feedback.join(", ")}]`
          ).join("\n");

          return `Session on ${date} (Duration: ${duration}):\n${exercisesList || "   (No exercises)"}`;
      }).join("\n\n");

      const userContext = `
        CURRENT USER PROFILE:
        Name: ${profile.displayName}
        Birthday: ${profile.birthday || "Not specified"}
        Interests: ${profile.interests}
        Goals: ${profile.goals}
        
        COMPLETE WORKOUT HISTORY (Most recent first):
        Total Sessions: ${history.length}
        
        ${historyContext}
      `;

      // Define the Schema for structured JSON output
      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Title of the strategy phase" },
          points: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                focus: { type: Type.STRING, description: "Short bold keyword phrase" },
                instruction: { type: Type.STRING, description: "Specific actionable advice" }
              }
            }
          }
        },
        required: ["title", "points"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userContext,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
      });

      return response.text || "";
    } catch (e) {
      console.error("AI Analysis Failed", e);
      return profile.expertSuggestions || "";
    }
  };

  const handleLogin = (name: string) => {
    setCurrentUser(name);
    setView("dashboard");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView("auth");
  };

  const handleStartSession = () => {
    setView("live");
  };

  const handleEndSession = async (sessionData: WorkoutSession) => {
    if (!currentUser) return;
    const finalSession = { ...sessionData, userId: currentUser };
    await db.saveSession(finalSession);
    
    // Trigger Re-analysis after workout
    if (currentProfile) {
        // Fetch fresh history including just saved session
        const freshHistory = [finalSession, ...sessions]; 
        const newSuggestions = await generateExpertSuggestions(currentProfile, freshHistory);
        const updatedProfile = { ...currentProfile, expertSuggestions: newSuggestions };
        await db.saveProfile(updatedProfile);
        setCurrentProfile(updatedProfile);
    }
    
    setView("dashboard");
  };

  const handleSaveProfile = async (profile: UserProfile) => {
    setIsAnalyzing(true);
    // Generate AI suggestions based on new profile data
    const newSuggestions = await generateExpertSuggestions(profile, sessions);
    
    const finalProfile = { ...profile, expertSuggestions: newSuggestions };
    
    await db.saveProfile(finalProfile);
    setCurrentProfile(finalProfile);
    setIsAnalyzing(false);
    setView("dashboard");
  };

  // Views
  if (view === "auth") return <AuthView onLogin={handleLogin} />;
  
  if (view === "live") return (
    <LiveSessionView 
      userId={currentUser!} 
      onEndSession={handleEndSession} 
    />
  );
  
  if (view === "profile") return (
    <ProfileView 
      user={currentUser!} 
      initialProfile={currentProfile}
      onSave={handleSaveProfile}
      onBack={() => setView("dashboard")}
      isAnalyzing={isAnalyzing}
    />
  );

  if (view === "chat") return (
      <ChatView 
        userProfile={currentProfile} 
        sessions={sessions}
        onBack={() => setView("dashboard")}
      />
  );

  return (
    <DashboardView
      user={currentUser!}
      onStartSession={handleStartSession}
      onLogout={handleLogout}
      onNavigateToProfile={() => setView("profile")}
      onNavigateToChat={() => setView("chat")}
    />
  );
};

const container = document.getElementById("app");
if (container) {
    const root = createRoot(container);
    root.render(<App />);
} else {
    console.error("FATAL: Failed to find #app container");
}
