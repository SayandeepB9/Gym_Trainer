
import React, { useState, useEffect } from "react";
import { UserProfile } from "./types";

interface ProfileViewProps {
  user: string;
  initialProfile: UserProfile | undefined;
  onSave: (profile: UserProfile) => void;
  onBack: () => void;
  isAnalyzing: boolean;
}

export const ProfileView = ({ user, initialProfile, onSave, onBack, isAnalyzing }: ProfileViewProps) => {
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    displayName: user,
    birthday: "",
    interests: "",
    goals: "",
    ...initialProfile
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const profile: UserProfile = {
      userId: user,
      displayName: formData.displayName || user,
      birthday: formData.birthday || "",
      interests: formData.interests || "",
      goals: formData.goals || "",
      expertSuggestions: initialProfile?.expertSuggestions || "Analysis pending...",
      lastAnalysisDate: initialProfile?.lastAnalysisDate || new Date().toISOString()
    };
    onSave(profile);
  };

  const renderStrategy = (content: string) => {
    try {
      const data = JSON.parse(content);
      return (
        <div>
           <h3 className="text-lg font-bold text-amber-300 mb-2">{data.title}</h3>
           <ul className="space-y-2">
             {data.points?.map((pt: any, i: number) => (
               <li key={i} className="text-sm text-amber-100/80">
                 <strong className="text-amber-200">{pt.focus}:</strong> {pt.instruction}
               </li>
             ))}
           </ul>
        </div>
      );
    } catch (e) {
      return <p className="text-amber-100 whitespace-pre-wrap text-sm">{content}</p>;
    }
  };

  if (isAnalyzing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold animate-pulse">Analyzing Profile...</h2>
          <p className="text-slate-400 mt-2">The AI Expert is crafting your strategy.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="text-slate-400 hover:text-white mb-6 flex items-center gap-2">
          &larr; Back to Dashboard
        </button>
        
        <h1 className="text-3xl font-bold mb-2 text-blue-400">Your Athlete Profile</h1>
        <p className="text-slate-400 mb-8">Tell us about yourself so the AI can tailor your training.</p>

        {initialProfile?.expertSuggestions && (
          <div className="bg-amber-900/20 border border-amber-500/30 p-4 rounded-xl mb-8">
            <h3 className="text-amber-400 font-bold mb-2 uppercase text-xs tracking-wide">Current Expert Strategy</h3>
            {renderStrategy(initialProfile.expertSuggestions)}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Display Name</label>
            <input
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Birthday</label>
            <input
              type="date"
              name="birthday"
              value={formData.birthday}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Training Interests</label>
            <textarea
              name="interests"
              value={formData.interests}
              onChange={handleChange}
              placeholder="e.g. HIIT, Yoga, Powerlifting, Calisthenics..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white h-24"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Goals</label>
            <textarea
              name="goals"
              value={formData.goals}
              onChange={handleChange}
              placeholder="e.g. Do 30 mins exercise daily, Get thick biceps, Run a marathon..."
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-white h-24"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors shadow-lg"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
};
