
import React, { useState } from "react";

export const AuthView = ({ onLogin }: { onLogin: (name: string) => void }) => {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onLogin(name.trim());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
        <h1 className="text-3xl font-bold mb-6 text-center text-blue-400">AI Gym Trainer</h1>
        <p className="text-slate-400 mb-8 text-center">
          Enter your name to access your workout history and start a new session.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Username</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-white placeholder-slate-500"
              placeholder="e.g. IronArnie"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Enter Gym
          </button>
        </form>
      </div>
    </div>
  );
};
