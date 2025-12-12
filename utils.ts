
export const AUDIO_INPUT_SAMPLE_RATE = 16000;
export const AUDIO_OUTPUT_SAMPLE_RATE = 24000;

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Optimized PCM conversion without DataView overhead
export function float32To16BitPCM(float32Arr: Float32Array): ArrayBuffer {
  const int16Arr = new Int16Array(float32Arr.length);
  for (let i = 0; i < float32Arr.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Arr[i]));
    int16Arr[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Arr.buffer;
}

export function pcmToAudioBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
): AudioBuffer {
  // Safety: Ensure data length is even (Int16Array requires multiple of 2 bytes)
  const length = data.length - (data.length % 2);
  
  // Create a copy of the buffer to ensure byte alignment.
  // Uint8Array.buffer might point to a larger buffer with an unaligned offset.
  // Creating a new ArrayBuffer via slice guarantees alignment.
  const alignedBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + length);
  const pcm16 = new Int16Array(alignedBuffer);
  
  const buffer = ctx.createBuffer(1, pcm16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < pcm16.length; i++) {
    channelData[i] = pcm16[i] / 32768.0;
  }
  return buffer;
}
