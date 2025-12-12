
import React, { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { ExerciseLog, WorkoutSession } from "./types";
import { db } from "./db";
import {
  AUDIO_INPUT_SAMPLE_RATE,
  AUDIO_OUTPUT_SAMPLE_RATE,
  base64ToUint8Array,
  arrayBufferToBase64,
  float32To16BitPCM,
  pcmToAudioBuffer,
} from "./utils";

export const LiveSessionView = ({
  userId,
  onEndSession,
}: {
  userId: string;
  onEndSession: (sessionData: WorkoutSession) => Promise<void>;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  
  const [status, setStatus] = useState("Ready");
  const [isConnected, setIsConnected] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  
  // UI State
  const [currentExercise, setCurrentExercise] = useState("Idle");
  const [currentReps, setCurrentReps] = useState(0);
  const [detectedError, setDetectedError] = useState("");
  const [feedback, setFeedback] = useState("Waiting for session start...");
  const [isGoodForm, setIsGoodForm] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  
  // --- Tracking State Machine ---
  interface ExerciseSegment {
    name: string;
    startTime: number;
    reps: number;
    feedback: Set<string>;
  }

  const trackingStateRef = useRef<{
    activeSegment: ExerciseSegment | null;
    history: ExerciseLog[];
  }>({
    activeSegment: null,
    history: [],
  });

  const resourcesRef = useRef<{
      stream: MediaStream | null;
      audioCtx: AudioContext | null;
      processor: ScriptProcessorNode | null;
      source: MediaStreamAudioSourceNode | null;
      videoInterval: any;
      gainNode: GainNode | null;
      session: any;
  }>({
      stream: null,
      audioCtx: null,
      processor: null,
      source: null,
      videoInterval: null,
      gainNode: null,
      session: null
  });

  useEffect(() => {
      return () => {
          stopSession();
      }
  }, []);

  const stopSession = () => {
      const resources = resourcesRef.current;
      
      if (resources.videoInterval) {
          clearInterval(resources.videoInterval);
          resources.videoInterval = null;
      }
      if (resources.processor) {
          resources.processor.disconnect();
          resources.processor = null;
      }
      if (resources.source) {
          resources.source.disconnect();
          resources.source = null;
      }
      if (resources.gainNode) {
          resources.gainNode.disconnect();
          resources.gainNode = null;
      }
      if (resources.stream) {
          resources.stream.getTracks().forEach(t => t.stop());
          resources.stream = null;
      }
      
      // Check if AudioContext is already closed or closing before calling close()
      if (resources.audioCtx) {
          if (resources.audioCtx.state !== 'closed') {
              resources.audioCtx.close().catch(e => console.warn("AudioContext close error:", e));
          }
          resources.audioCtx = null;
      }

      if (resources.session) {
          resources.session.close();
          resources.session = null;
      }
      
      audioSourcesRef.current.forEach(source => {
          try { source.stop(); } catch(e) {}
      });
      audioSourcesRef.current = [];
      setIsConnected(false);
  };

  const startSession = async () => {
    if (isConnected) return;
    setSessionStartTime(new Date());

    try {
      setStatus("Fetching profile data...");
      const profile = await db.getProfile(userId);

      setStatus("Loading instructions...");
      const promptResponse = await fetch("trainer_prompt.txt");
      if (!promptResponse.ok) throw new Error("Failed to load trainer prompts");
      let systemInstruction = await promptResponse.text();

      // INJECT DYNAMIC USER CONTEXT
      if (profile) {
          systemInstruction += `\n\n**USER CONTEXT - IMPORTANT**\n`;
          systemInstruction += `User Name: ${profile.displayName}\n`;
          if (profile.goals) systemInstruction += `User Goals: ${profile.goals}\n`;
          if (profile.interests) systemInstruction += `User Likes: ${profile.interests}\n`;
          
          if (profile.expertSuggestions) {
             try {
                // If the suggestions are JSON (new format), parse them for the LLM prompt
                const suggestions = JSON.parse(profile.expertSuggestions);
                systemInstruction += `**Gym Expert Strategy (Follow this):**\nTitle: ${suggestions.title}\n`;
                if (suggestions.points) {
                    suggestions.points.forEach((pt: any) => {
                        systemInstruction += `- ${pt.focus}: ${pt.instruction}\n`;
                    });
                }
             } catch(e) {
                // Fallback for old plain text
                systemInstruction += `**Gym Expert Strategy (Follow this):** ${profile.expertSuggestions}\n`;
             }
          }
          systemInstruction += `\nTailor your motivation and feedback to these goals.`;
      }

      setStatus("Requesting permissions...");
      
      const audioCtx = new AudioContext({ sampleRate: AUDIO_INPUT_SAMPLE_RATE });
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      resourcesRef.current.audioCtx = audioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360 },
        audio: {
          sampleRate: AUDIO_INPUT_SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });

      resourcesRef.current.stream = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setStatus("Connecting to Gemini...");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const reportExerciseTool = {
        name: "report_exercise_status",
        parameters: {
          type: Type.OBJECT,
          properties: {
            exercise_name: { type: Type.STRING, description: "Name of the exercise being performed, or 'Idle' if user is resting/stopped." },
            current_reps: { type: Type.INTEGER, description: "The current cumulative rep count for this specific set. Reset to 0 when exercise changes." },
            detected_error: { type: Type.STRING, description: "Specific form error (e.g. 'Hips too low'). Empty string if form is perfect." },
            correction_suggestion: { type: Type.STRING, description: "Short instruction to fix the error." },
            is_good_form: { type: Type.BOOLEAN, description: "True if form is correct, False if mistakes detected" },
          },
          required: ["exercise_name", "current_reps", "detected_error", "correction_suggestion", "is_good_form"],
        },
      };

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // Mute input loopback
      
      resourcesRef.current.source = source;
      resourcesRef.current.processor = processor;
      resourcesRef.current.gainNode = gainNode;
      
      let nextStartTime = 0;

      // Fix: Create a deferred promise to handle the circular dependency
      // where the callbacks need access to the session object that is created by the connect call.
      let resolveSession: (s: any) => void;
      const sessionPromise = new Promise<any>(r => resolveSession = r);

      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          tools: [{ functionDeclarations: [reportExerciseTool] }],
          systemInstruction: systemInstruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
        callbacks: {
          onopen: () => {
              setStatus("Connected! Trainer Active.");
              setIsConnected(true);
              
              // Audio Streaming
              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = float32To16BitPCM(inputData);
                const base64 = arrayBufferToBase64(pcm16);
                
                sessionPromise.then(sess => {
                    sess.sendRealtimeInput({
                      media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: base64
                      }
                    });
                });
              };
              source.connect(processor);
              processor.connect(gainNode);
              gainNode.connect(audioCtx.destination);

              // Video Streaming
              resourcesRef.current.videoInterval = window.setInterval(() => {
                if (videoRef.current && canvasRef.current) {
                  const ctx = canvasRef.current.getContext("2d");
                  const vid = videoRef.current;
                  if (ctx && vid.readyState === 4) {
                    canvasRef.current.width = 512; 
                    canvasRef.current.height = 288;
                    // Draw video without timestamp overlay
                    ctx.drawImage(vid, 0, 0, 512, 288);
                    
                    const base64 = canvasRef.current.toDataURL("image/jpeg", 0.6).split(",")[1];
                    
                    sessionPromise.then(sess => {
                        sess.sendRealtimeInput({
                          media: {
                            mimeType: "image/jpeg",
                            data: base64
                          }
                        });
                    });
                  }
                }
              }, 200); 
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Audio Output
             const audioData = msg.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
             if (audioData) {
                if (audioCtx.state === 'suspended') await audioCtx.resume();
                const audioBytes = base64ToUint8Array(audioData);
                const audioBuffer = pcmToAudioBuffer(audioBytes, audioCtx, AUDIO_OUTPUT_SAMPLE_RATE);
                const sourceNode = audioCtx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(audioCtx.destination);
                
                const now = audioCtx.currentTime;
                const startTime = Math.max(now, nextStartTime);
                sourceNode.start(startTime);
                setIsSpeaking(true);
                
                audioSourcesRef.current.push(sourceNode);
                sourceNode.onended = () => {
                    audioSourcesRef.current = audioSourcesRef.current.filter(s => s !== sourceNode);
                    if (audioSourcesRef.current.length === 0) setIsSpeaking(false);
                };
                nextStartTime = startTime + audioBuffer.duration;
             }
             
             if (msg.serverContent?.interrupted) {
                 audioSourcesRef.current.forEach(src => { try { src.stop(); } catch(e) {} });
                 audioSourcesRef.current = [];
                 nextStartTime = 0;
                 setIsSpeaking(false);
             }

             // Handle Tool Calls (State Updates)
             if (msg.toolCall) {
                for (const fc of msg.toolCall.functionCalls) {
                    if (fc.name === "report_exercise_status") {
                       const args: any = fc.args;
                       const exercise_name = args.exercise_name;
                       const reps = Number(args.current_reps) || 0;
                       
                       const detected_error = (args.detected_error && args.detected_error.toLowerCase() !== "none") 
                         ? args.detected_error : "";
                       
                       // UI Updates
                       setCurrentExercise(exercise_name);
                       setCurrentReps(reps);
                       setDetectedError(detected_error);
                       setFeedback(args.correction_suggestion || "");
                       setIsGoodForm(!!args.is_good_form);
                       
                       // --- TRACKING LOGIC ---
                       const now = Date.now();
                       const state = trackingStateRef.current;
                       
                       // If exercise changed (or went to Idle)
                       if (state.activeSegment && state.activeSegment.name !== exercise_name) {
                           // 1. Close current segment
                           const duration = (now - state.activeSegment.startTime) / 1000;
                           if (duration > 2 && state.activeSegment.name !== "Idle") {
                               state.history.push({
                                   name: state.activeSegment.name,
                                   durationSeconds: Math.round(duration),
                                   reps: state.activeSegment.reps,
                                   feedback: Array.from(state.activeSegment.feedback)
                               });
                           }
                           state.activeSegment = null;
                       }
                       
                       // 2. Start new segment if needed
                       if (exercise_name !== "Idle") {
                           if (!state.activeSegment) {
                               state.activeSegment = {
                                   name: exercise_name,
                                   startTime: now,
                                   reps: reps,
                                   feedback: new Set()
                               };
                           } else {
                               // Update existing segment
                               state.activeSegment.reps = Math.max(state.activeSegment.reps, reps);
                           }
                           
                           // Collect feedback
                           if (detected_error) {
                               state.activeSegment.feedback.add(detected_error);
                           }
                       }
                       
                       // Send Response
                       sessionPromise.then(sess => {
                           sess.sendToolResponse({
                             functionResponses: [{
                               name: fc.name,
                               id: fc.id,
                               response: { result: "ok" }
                             }]
                           });
                       });
                    }
                }
             }
          },
          onerror: (err) => {
             console.error("Live Session Error:", err);
             setStatus("Error: " + (err as any).message);
             setIsConnected(false);
          },
          onclose: () => {
              setStatus("Disconnected");
              setIsConnected(false);
          }
        }
      });
      
      resolveSession!(session);
      resourcesRef.current.session = session;

    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err as Error).message);
      setIsConnected(false);
    }
  };

  // UI Timer
  const [elapsedTime, setElapsedTime] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionStartTime) {
          setElapsedTime(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const handleEnd = async () => {
    // 1. Prevent multiple submissions
    if (isFinishing) return;
    setIsFinishing(true);

    // 2. Immediate Resource Cleanup (Visual/Audio Stop)
    stopSession();

    // 3. Process Data
    const now = Date.now();
    const startDate = sessionStartTime || new Date(); // Fallback if no start time

    // Close any pending segment logic
    const state = trackingStateRef.current;
    if (state.activeSegment) {
        const duration = (now - state.activeSegment.startTime) / 1000;
        if (duration > 2 && state.activeSegment.name !== "Idle") {
            state.history.push({
                name: state.activeSegment.name,
                durationSeconds: Math.round(duration),
                reps: state.activeSegment.reps,
                feedback: Array.from(state.activeSegment.feedback)
            });
        }
    }

    const finalExercises = state.history.map(ex => ({
        ...ex,
        feedback: ex.feedback
    }));

    const sessionData: WorkoutSession = {
      id: crypto.randomUUID(),
      userId: userId, 
      date: startDate.toISOString(),
      totalDurationSeconds: Math.floor((now - startDate.getTime()) / 1000),
      exercises: finalExercises
    };

    // 4. Async Save (Parent will unmount us when done)
    await onEndSession(sessionData);
  };

  // --- RENDER: CLOSING SCREEN ---
  if (isFinishing) {
      return (
          <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6 relative overflow-hidden">
              {/* Background Accent */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-amber-500 animate-pulse"></div>
              
              <div className="flex flex-col items-center space-y-6 z-10">
                  <div className="relative">
                      <div className="w-20 h-20 border-4 border-blue-900/50 rounded-full"></div>
                      <div className="absolute top-0 left-0 w-20 h-20 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                         <span className="text-2xl">💾</span>
                      </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                      <h2 className="text-2xl font-bold text-white">Saving Workout...</h2>
                      <p className="text-slate-400">The Gym Expert is analyzing your performance.</p>
                      <p className="text-slate-500 text-sm animate-pulse">Updating strategy based on your reps...</p>
                  </div>
              </div>
          </div>
      );
  }

  // --- RENDER: LIVE WORKOUT ---
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden">
        <canvas ref={canvasRef} className="hidden" />
        <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-80" />
        
        {!isConnected && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                <div className="text-center p-6 max-w-sm">
                    <h2 className="text-2xl font-bold mb-4 text-blue-400">Gym Trainer</h2>
                    <p className="text-slate-300 mb-8">
                        I will track your reps and form visually. Please ensure your full body is in frame.
                    </p>
                    <button 
                        onClick={startSession}
                        disabled={status !== "Ready" && !status.startsWith("Error")}
                        className={`px-8 py-4 text-white font-bold rounded-xl text-xl shadow-lg transition-all ${
                            status !== "Ready" && !status.startsWith("Error") ? "bg-slate-600" : "bg-blue-600 hover:bg-blue-500"
                        }`}
                    >
                        {status === "Ready" || status.startsWith("Error") ? "Start Workout" : "Connecting..."}
                    </button>
                    {status.startsWith("Error") && <p className="text-red-400 mt-4">{status}</p>}
                </div>
            </div>
        )}

        {isConnected && (
            <>
                <div className={`absolute top-4 left-4 p-6 rounded-2xl border backdrop-blur-md max-w-sm z-10 transition-all shadow-xl ${
                    isGoodForm ? 'bg-black/60 border-green-500/30' : 'bg-red-900/80 border-red-500 animate-pulse'
                }`}>
                  <div className="flex items-center gap-2 mb-4">
                     <div className={`w-3 h-3 rounded-full ${currentExercise !== "Idle" ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`} />
                     <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">
                       {currentExercise !== "Idle" ? "Recording" : "Idle"}
                     </p>
                     {isSpeaking && <div className="ml-2 w-2 h-2 bg-blue-400 rounded-full animate-bounce"/>}
                  </div>
                  
                  <div className="flex justify-between items-end mb-4">
                      <div>
                        <p className="text-xs text-slate-400 uppercase mb-1">Exercise</p>
                        <p className="text-2xl font-bold text-white tracking-tight">{currentExercise}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-xs text-slate-400 uppercase mb-1">Reps</p>
                         <p className="text-5xl font-bold text-blue-400 leading-none">{currentReps}</p>
                      </div>
                  </div>
                  
                  <div>
                    {detectedError && (
                        <div className="mb-2 bg-red-500/20 border border-red-500/50 p-2 rounded text-red-200 text-sm font-bold animate-pulse">
                            ⚠️ {detectedError}
                        </div>
                    )}
                    <p className={`text-lg font-medium leading-snug ${isGoodForm ? 'text-green-300' : 'text-white'}`}>
                        "{feedback}"
                    </p>
                  </div>
                </div>

                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                    <p className="text-2xl font-mono font-bold">
                        {Math.floor(elapsedTime / 60).toString().padStart(2, '0')}:
                        {(elapsedTime % 60).toString().padStart(2, '0')}
                    </p>
                </div>
            </>
        )}
      </div>

      <div className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-6 z-10">
        <button 
            onClick={handleEnd}
            disabled={isFinishing}
            className="px-8 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-full shadow-lg transition-colors"
        >
          {isFinishing ? "Finishing..." : "Finish Workout"}
        </button>
      </div>
    </div>
  );
};
