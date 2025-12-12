
import { WorkoutSession, UserProfile } from "./types";

class GymDatabase {
  private dbName = "GymTrainerDB";
  private storeName = "sessions";
  private profileStoreName = "profiles";
  private version = 2; // Incremented version

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(this.profileStoreName)) {
          db.createObjectStore(this.profileStoreName, { keyPath: "userId" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSession(session: WorkoutSession): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const request = store.put(session);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSessions(userId: string): Promise<WorkoutSession[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const allSessions = request.result as WorkoutSession[];
        const userSessions = allSessions.filter((s) => s.userId === userId);
        userSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        resolve(userSessions);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.profileStoreName], "readwrite");
      const store = transaction.objectStore(this.profileStoreName);
      const request = store.put(profile);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProfile(userId: string): Promise<UserProfile | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.profileStoreName], "readonly");
      const store = transaction.objectStore(this.profileStoreName);
      const request = store.get(userId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new GymDatabase();
