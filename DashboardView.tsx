
import React, { useState, useEffect } from "react";
import { WorkoutSession, UserProfile } from "./types";
import { db } from "./db";

interface DashboardViewProps {
  user: string;
  onStartSession: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToChat: () => void;
}

export const DashboardView = ({
  user,
  onStartSession,
  onLogout,
  onNavigateToProfile,
  onNavigateToChat
}: DashboardViewProps) => {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [profile, setProfile] = useState<UserProfile | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      db.getSessions(user),
      db.getProfile(user)
    ]).then(([sessionsData, profileData]) => {
      setSessions(sessionsData);
      setProfile(profileData);
      setLoading(false);
    });
  }, [user]);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // Helper to render strategy content safely (JSON or Text)
  const renderStrategy = (content: string) => {
    try {
      const data = JSON.parse(content);
      return (
        <div>
           <h3 className="text-xl font-bold text-amber-300 mb-3">{data.title}</h3>
           <ul className="space-y-3">
             {data.points?.map((pt: any, i: number) => (
               <li key={i} className="flex gap-3 text-amber-100/90 items-start">
                 <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider mt-1 whitespace-nowrap">
                   {pt.focus}
                 </span>
                 <span className="leading-relaxed text-sm">{pt.instruction}</span>
               </li>
             ))}
           </ul>
        </div>
      );
    } catch (e) {
      // Fallback for old plaintext format
      return <p className="text-amber-100 text-lg leading-relaxed whitespace-pre-wrap font-medium">{content}</p>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-blue-400">Welcome, {user}</h1>
            <p className="text-slate-400">Ready to crush it today?</p>
          </div>
          <div className="flex gap-4 items-center">
            <button
                onClick={onNavigateToProfile}
                className="text-sm bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg transition-colors"
            >
                Edit Profile
            </button>
            <button
              onClick={onLogout}
              className="text-sm text-slate-400 hover:text-white underline"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Expert Suggestions Panel */}
        {profile?.expertSuggestions && (
          <div className="mb-8 bg-gradient-to-r from-amber-900/40 to-slate-800 border border-amber-500/30 rounded-2xl p-6 shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <svg className="w-24 h-24 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
             </div>
             <div className="relative z-10">
                <h2 className="text-amber-400 font-bold uppercase tracking-wider text-xs mb-3 flex items-center gap-2">
                  <span className="text-lg">★</span> Gym Expert Strategy
                </h2>
                {renderStrategy(profile.expertSuggestions)}
             </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Main Action */}
          <div className="md:col-span-2 bg-slate-800 rounded-2xl p-6 border border-slate-700 flex flex-col items-center justify-center text-center min-h-[200px]">
            <h2 className="text-xl font-semibold mb-4">Start New Session</h2>
            <p className="text-slate-400 mb-6 max-w-sm">
              Activate your camera and microphone. The AI will count your reps, monitor your form, and track your pacing.
            </p>
            <button
              onClick={onStartSession}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-lg shadow-lg hover:shadow-green-500/20 transition-all transform hover:-translate-y-1"
            >
              Start Workout
            </button>
          </div>

          {/* Stats & Tools */}
          <div className="flex flex-col gap-6">
            <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 flex-1">
                <h3 className="text-lg font-semibold mb-2 text-slate-200">Stats</h3>
                <div className="space-y-4">
                <div>
                    <p className="text-slate-500 text-sm">Total Sessions</p>
                    <p className="text-2xl font-bold">{sessions.length}</p>
                </div>
                <div>
                    <p className="text-slate-500 text-sm">Total Time</p>
                    <p className="text-2xl font-bold">
                    {formatDuration(sessions.reduce((acc, s) => acc + s.totalDurationSeconds, 0))}
                    </p>
                </div>
                </div>
            </div>
            
            <button 
                onClick={onNavigateToChat}
                className="bg-blue-900/50 hover:bg-blue-800/50 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-center gap-3 transition-all group"
            >
                <span className="text-2xl group-hover:scale-110 transition-transform">🤖</span>
                <span className="font-bold text-blue-200">Chat with Coach AI</span>
            </button>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-4 border-b border-slate-700 pb-2">History</h2>
        {loading ? (
          <p className="text-slate-500">Loading history...</p>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-500">No workouts recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-lg">{formatDate(session.date)}</h4>
                  <span className="bg-slate-700 px-3 py-1 rounded-full text-xs text-blue-300">
                    {formatDuration(session.totalDurationSeconds)}
                  </span>
                </div>
                <div className="space-y-2 mt-3">
                  {session.exercises.map((ex, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm p-2 bg-slate-900/50 rounded-lg">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-200">{ex.name}</span>
                        {ex.reps > 0 && <span className="text-xs text-blue-400 font-bold">{ex.reps} Reps</span>}
                      </div>
                      <span className="text-slate-400 font-mono">{formatDuration(ex.durationSeconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
