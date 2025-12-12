
import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { UserProfile, WorkoutSession } from "./types";
import ReactMarkdown from "react-markdown";

interface ChatViewProps {
  userProfile: UserProfile | undefined;
  sessions: WorkoutSession[];
  onBack: () => void;
}

interface Message {
  role: "user" | "model";
  text: string;
}

export const ChatView = ({ userProfile, sessions, onBack }: ChatViewProps) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "model", text: `Hi ${userProfile?.displayName || "Athlete"}! I'm your Gym Expert. I can help you plan workouts, explain exercises, or find video tutorials. What's on your mind?` }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper to ensure raw URLs in text become clickable markdown links
  // This captures http/https links that are NOT already part of a markdown link syntax like ](url)
  const formatTextWithLinks = (text: string) => {
    return text.replace(
      /(?<!\]\()(?<!href=")(https?:\/\/[^\s]+)/g, 
      (url) => `[${url}](${url})`
    );
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input;
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const promptResponse = await fetch("chat_prompt.txt");
      const systemInstruction = await promptResponse.text();

      // Format full session history
      const historyContext = sessions.map((s, i) => {
          const date = new Date(s.date).toLocaleString();
          const duration = `${Math.floor(s.totalDurationSeconds / 60)}m ${s.totalDurationSeconds % 60}s`;
          
          const exercisesList = s.exercises.map(e => 
              `   - ${e.name}: ${e.reps} reps, ${e.durationSeconds}s duration. Form Feedback: "${e.feedback.join(", ")}"`
          ).join("\n");

          return `Session on ${date} (Total Time: ${duration}):\n${exercisesList || "   (No exercises recorded)"}`;
      }).join("\n\n");

      // Build comprehensive context
      const context = `
        CURRENT USER PROFILE:
        Name: ${userProfile?.displayName || "Unknown"}
        Birthday: ${userProfile?.birthday || "Not specified"}
        Interests: ${userProfile?.interests || "Not specified"}
        Goals: ${userProfile?.goals || "Not specified"}
        Current AI Expert Strategy (JSON): ${userProfile?.expertSuggestions || "None"}
        
        COMPLETE WORKOUT HISTORY (Most recent first):
        Total Sessions: ${sessions.length}
        
        ${historyContext}
        
        INSTRUCTION: Use the specific data above (reps, dates, durations) to answer the user's questions accurately. If they ask about "last session", refer to the top-most entry in the history.
      `;

      // Use Gemini 3 Pro for advanced reasoning and search
      const model = "gemini-3-pro-preview"; 
      
      const response = await ai.models.generateContent({
        model: model,
        contents: [
            { role: "user", parts: [{ text: context }] }, 
            ...messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            { role: "user", parts: [{ text: userMsg }] }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction: systemInstruction
        }
      });

      let responseText = response.text || "";
      
      // Extract grounding links (YouTube videos) and format as Markdown
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
          const links = groundingChunks
            .map(c => c.web?.uri)
            .filter(uri => uri && (uri.includes("youtube.com") || uri.includes("youtu.be")))
            .map(uri => `[Watch Video on YouTube](${uri})`) // Explicit Markdown formatting
            .join("\n\n");
          
          if (links) {
              responseText += `\n\n**Suggested Videos:**\n${links}`;
          }
      }

      setMessages(prev => [...prev, { role: "model", text: responseText }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "model", text: "Sorry, I had trouble connecting to the gym mainframe. Try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white">
      <header className="bg-slate-800 p-4 border-b border-slate-700 flex items-center justify-between shadow-md">
        <button onClick={onBack} className="text-slate-400 hover:text-white font-medium">
          &larr; Exit Chat
        </button>
        <h1 className="font-bold text-lg text-blue-400">Coach AI</h1>
        <div className="w-8"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
              msg.role === "user" 
                ? "bg-blue-600 text-white" 
                : "bg-slate-700 text-slate-100 border border-slate-600"
            }`}>
              {msg.role === "user" ? (
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown
                    components={{
                      a: ({node, ...props}) => <a {...props} className="text-blue-300 hover:text-blue-200 underline break-all" target="_blank" rel="noopener noreferrer" />,
                      p: ({node, ...props}) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
                      ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1" />,
                      ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1" />,
                      li: ({node, ...props}) => <li {...props} className="pl-1" />,
                      h1: ({node, ...props}) => <h1 {...props} className="text-xl font-bold mt-4 mb-2 text-blue-200" />,
                      h2: ({node, ...props}) => <h2 {...props} className="text-lg font-bold mt-3 mb-2 text-blue-200" />,
                      h3: ({node, ...props}) => <h3 {...props} className="text-md font-bold mt-2 mb-1 text-blue-200" />,
                      strong: ({node, ...props}) => <strong {...props} className="font-bold text-white" />,
                      blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-slate-500 pl-4 italic text-slate-300 my-2" />,
                    }}
                  >
                    {formatTextWithLinks(msg.text)}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex justify-start">
             <div className="bg-slate-700 text-slate-100 rounded-2xl p-4 border border-slate-600">
               <div className="flex space-x-2">
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
               </div>
             </div>
           </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="p-4 bg-slate-800 border-t border-slate-700">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about exercises, form, or nutrition..."
            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 rounded-xl transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
