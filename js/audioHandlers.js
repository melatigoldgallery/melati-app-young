import { AUDIO_PATHS } from "./audioConfig.js";

let isAudioPlaying = false;
let audioCtx = null; 

export function isAudioBusy() {
  return isAudioPlaying;
}

export function cancelAllAudio() {
  window.speechSynthesis.cancel();
  isAudioPlaying = false;
}

async function playAudio(audioPath) {
  return new Promise((resolve) => {
    const audio = new Audio(audioPath);
    audio.addEventListener("ended", resolve, { once: true });
    audio.play().catch((err) => {
      console.error(`Error playing audio ${audioPath}:`, err);
       resolve(); 
    });
  });
}

async function speak(text, rate = 0.85, pitch = 1.2) {
  if (!("speechSynthesis" in window)) {
    console.warn("Text-to-speech tidak didukung");
    return Promise.resolve();
  }

  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = rate;
    utterance.pitch = pitch;

    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find((v) => v.lang.includes("id"));
    if (idVoice) utterance.voice = idVoice;

    utterance.onend = resolve;
    utterance.onerror = () => {
      console.error("TTS error");
      resolve();
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 0);
  });
}

export async function playWaitMessageSequence() {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    await playAudio(AUDIO_PATHS.informasi);

    const message =
      "Kepada Pelanggan Melati yang belum dilayani, kami mohon kesabarannya untuk menunggu pelayanan. Terima kasih atas perhatiannya";
    await speak(message);

    await playAudio(AUDIO_PATHS.informasiEnd);

    isAudioPlaying = false;
    return true; 
  } catch (error) {
    console.error("Error playing wait message:", error);
    isAudioPlaying = false;
    return false;
  }
}

export async function playTakeQueueMessage() {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    await playAudio(AUDIO_PATHS.informasi);
    const message =
      "Kepada pelanggan yang belum mendapat nomor antrian, harap mengambil nomor antrian terlebih dahulu di tempat yang sudah disediakan. Terima kasih atas perhatiannya";
    await speak(message);

    await playAudio(AUDIO_PATHS.informasiEnd);

    isAudioPlaying = false;
    return true;
  } catch (error) {
    console.error("Error playing take queue message:", error);
    isAudioPlaying = false;
    return false;
  }
}

export async function announceQueueNumber(queueNumber) {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    const letter = queueNumber.charAt(0);
    const numbers = queueNumber.substring(1);
    const text = `Nomor antrian, ${letter}, ${numbers.split("").join("")}`;

    await speak(text);

    isAudioPlaying = false;
    return true;
  } catch (error) {
    console.error("Error announcing queue number:", error);
    isAudioPlaying = false;
    return false;
  }
}

export async function playQueueAnnouncement(queueNumber) {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    const letter = queueNumber.charAt(0);
    const numbers = queueNumber.substring(1);
    const text = `Nomor antrian, ${letter}, ${numbers.split("").join("")}, silahkan angkat tangan`;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.rate = 0.85;
    utterance.pitch = 1.2;

    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find((v) => v.lang.includes("id"));
    if (idVoice) utterance.voice = idVoice;

    const openingAudio = new Audio(AUDIO_PATHS.antrian);

    await new Promise((resolve) => {
      openingAudio.addEventListener(
        "ended",
        () => {
          window.speechSynthesis.speak(utterance);

          utterance.onend = resolve;
          utterance.onerror = () => {
            console.error("TTS error");
            resolve();
          };
        },
        { once: true }
      );

      openingAudio.play().catch((err) => {
        console.error(`Error playing opening audio:`, err);
        resolve();
      });
    });

    isAudioPlaying = false;
    return true;
  } catch (error) {
    console.error("Error announcing queue:", error);
    isAudioPlaying = false;
    return false;
  }
}

export async function announceVehicleMessage(carType, plateNumber, vehicleColor = "") {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    await playAudio(AUDIO_PATHS.informasi);

    const colorInfo = vehicleColor ? `warna ${vehicleColor}` : "";
    const message = `Mohon kepada pemilik ${carType} ${colorInfo} dengan nomor polisi, ${plateNumber}, untuk memindahkan kendaraan karena ada kendaraan yang akan keluar. Terima kasih atas perhatiannya`;

    await speak(message);

    await playAudio(AUDIO_PATHS.informasiEnd);

    isAudioPlaying = false;
    return true;
  } catch (error) {
    console.error("Error announcing vehicle message:", error);
    isAudioPlaying = false;
    return false;
  }
}

export function playNotificationSound() {
  if (isAudioPlaying) return false;

  try {
    const audio = new Audio(AUDIO_PATHS.notifOn);
    audio.play().catch((err) => console.error("Error playing notification:", err));
    return true;
  } catch (error) {
    console.error("Error playing notification sound:", error);
    return false;
  }
}

export function primeAudioPlayback() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    const buffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);

    try {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0; 
      window.speechSynthesis.speak(u);
      window.speechSynthesis.cancel();
    } catch (_) {}
  } catch (e) {
    console.warn("primeAudioPlayback failed", e);
  }
}

export async function playClosingAnnouncement(message, infoBoxId = "infoBox") {
  if (isAudioPlaying) return false;

  try {
    isAudioPlaying = true;

    await playAudio(AUDIO_PATHS.informasi);

    await speak(message, 0.75, 1.2);

    await playAudio(AUDIO_PATHS.informasiEnd);

    isAudioPlaying = false;
    return true;
  } catch (error) {
    console.error("Error playing closing announcement:", error);
    isAudioPlaying = false;
    return false;
  }
}

(function init() {
  Object.values(AUDIO_PATHS).forEach((path) => {
    const audio = new Audio();
    audio.src = path;
    audio.preload = "auto";
  });

  setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 5000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (_) {}
    }
  });
})();
