// src/utils/backendManager.js
// Backend Manager for SENTINEL Application
// In Tauri applications, the backend is managed by the Rust layer

class BackendManager {
  constructor() {
    this.isStarted = false;
    this.startPromise = null;
  }

  async start() {
    // In Tauri applications, the Python backend is started by the Rust layer
    // We just need to mark it as started
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise((resolve) => {
      // The Tauri app handles backend startup
      // We just wait a moment to ensure it's ready
      setTimeout(() => {
        this.isStarted = true;
        resolve();
      }, 100);
    });

    return this.startPromise;
  }

  async waitForBackend() {
    // Wait for the backend to be available by checking the health endpoint
    const maxAttempts = 30; // 30 seconds maximum wait
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch('http://127.0.0.1:8000/health', {
          method: 'GET',
          signal: AbortSignal.timeout(1000) // 1 second timeout
        });
        
        if (response.ok) {
          console.log('Backend is ready');
          return true;
        }
      } catch (error) {
        // Backend not ready yet, continue waiting
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }

    throw new Error('Backend failed to start within timeout period');
  }

  stop() {
    // In Tauri applications, backend lifecycle is managed by Rust
    // We just reset our state
    this.isStarted = false;
    this.startPromise = null;
  }

  isRunning() {
    return this.isStarted;
  }
}

// Create a singleton instance
export const backendManager = new BackendManager();

export default backendManager;
