// YouTube Volume Controller
// Mengelola volume YouTube player saat announcement diputar

import { YOUTUBE_CONFIG } from "./youtube-config.js";

class YouTubeVolumeController {
  constructor() {
    this.player = null;
    this.originalVolume = YOUTUBE_CONFIG.defaultVolume;
    this.reducedVolume = YOUTUBE_CONFIG.reducedVolume;
    this.isReady = false;
    this.isFading = false;
    this.fadeInterval = null;
  }

  // Set YouTube player instance dari global YT Player
  setPlayer(player) {
    this.player = player;
    this.isReady = true;
    console.log("✅ YouTube player connected to controller");
  }

  // Fade volume secara smooth dari currentVolume ke targetVolume
  async fadeVolume(targetVolume, duration = 1000) {
    if (!this.player || !this.isReady || this.isFading) {
      return;
    }

    return new Promise((resolve) => {
      this.isFading = true;
      const currentVolume = this.player.getVolume();
      const volumeDiff = targetVolume - currentVolume;
      const steps = 30; // Jumlah step untuk smooth transition
      const stepDuration = duration / steps;
      const stepSize = volumeDiff / steps;

      let currentStep = 0;

      this.fadeInterval = setInterval(() => {
        currentStep++;

        if (currentStep >= steps) {
          // Pastikan volume final tepat
          this.player.setVolume(targetVolume);
          clearInterval(this.fadeInterval);
          this.isFading = false;
          resolve();
        } else {
          // Gradual volume change
          const newVolume = currentVolume + stepSize * currentStep;
          this.player.setVolume(Math.round(newVolume));
        }
      }, stepDuration);
    });
  }

  // Kecilkan volume YouTube dengan fade out effect
  async reduceVolume(fadeDuration = 1000) {
    if (!this.player || !this.isReady) {
      console.warn("⚠️ YouTube player not ready");
      return;
    }

    try {
      // Simpan volume asli
      this.originalVolume = this.player.getVolume();

      console.log(`🔉 Fading out: ${this.originalVolume}% → ${this.reducedVolume}%`);

      // Fade out ke volume rendah
      await this.fadeVolume(this.reducedVolume, fadeDuration);

      console.log(`✅ YouTube volume reduced to ${this.reducedVolume}%`);
    } catch (error) {
      console.error("Error reducing YouTube volume:", error);
    }
  }

  // Kembalikan volume YouTube dengan fade in effect
  async restoreVolume(fadeDuration = 1500) {
    if (!this.player || !this.isReady) {
      return;
    }

    try {
      console.log(`🔊 Fading in: ${this.reducedVolume}% → ${this.originalVolume}%`);

      // Fade in ke volume asli
      await this.fadeVolume(this.originalVolume, fadeDuration);

      console.log(`✅ YouTube volume restored to ${this.originalVolume}%`);
    } catch (error) {
      console.error("Error restoring YouTube volume:", error);
    }
  }

  // Check if player is ready
  isPlayerReady() {
    return this.isReady && this.player !== null;
  }

  // Stop any ongoing fade
  stopFade() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
      this.isFading = false;
    }
  }
}

// Export singleton instance
export const youtubeController = new YouTubeVolumeController();
