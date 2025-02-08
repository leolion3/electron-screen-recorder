const { ipcRenderer } = require('electron');
const { writeFile } = require('fs');  // not used directly in renderer now
const startStopBtn = document.getElementById('startStopBtn');
const quitBtn = document.getElementById('quitBtn');
const videoSourceSelect = document.getElementById('videoSource');
const micSourceSelect = document.getElementById('micSource');
const preview = document.getElementById('preview');
const timerDisplay = document.getElementById('timer');
const soundToggle = document.getElementById('soundToggle'); // checkbox for system sound
const micToggle = document.getElementById('micToggle');     // checkbox for microphone

let mediaRecorder;
let videoStream;
let recordedChunks = [];
let isRecording = false;
let timerInterval;
let seconds = 0;

// Fetch available video sources (screens, windows) and populate the dropdown.
async function getSources() {
  console.log("Fetching video sources...");
  const sources = await ipcRenderer.invoke('get-sources');
  sources.forEach(source => {
    const videoOption = document.createElement('option');
    videoOption.value = source.id;
    videoOption.textContent = source.name;
    videoSourceSelect.appendChild(videoOption);
  });
  console.log("Video sources fetched:", sources);
}

// Populate available microphone devices.
async function populateMicrophones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(device => device.kind === 'audioinput');
    micSourceSelect.innerHTML = '<option value="">Select a microphone</option>';
    mics.forEach(mic => {
      const option = document.createElement('option');
      option.value = mic.deviceId;
      option.textContent = mic.label || `Microphone ${micSourceSelect.length + 1}`;
      micSourceSelect.appendChild(option);
    });
    console.log("Microphones populated:", mics);
  } catch (e) {
    console.error("Error fetching microphones:", e);
  }
}

// Preview the selected video source.
async function previewSelectedSource(sourceId) {
  console.log("Previewing source:", sourceId);
  // Stop any existing video stream.
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  const sources = await ipcRenderer.invoke('get-sources');
  const selectedSource = sources.find(s => s.id === sourceId);
  if (!selectedSource) {
    console.error("No source found for id", sourceId);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: selectedSource.id,
        }
      },
      audio: false
    });
    preview.srcObject = stream;
    videoStream = stream;
    console.log("Video preview started.");
  } catch (e) {
    console.error("Error capturing video stream:", e);
  }
}

// Toggle recording on/off.
function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Start recording.
async function startRecording() {
  console.log("Starting recording...");
  if (!videoStream) {
    console.error("No video stream available.");
    return;
  }

  // Prepare an array to collect audio tracks.
  let audioTracks = [];

  // If the system sound toggle is checked, try to capture desktop audio.
  if (soundToggle.checked) {
    console.log("System sound enabled.");
    const sources = await ipcRenderer.invoke('get-sources');
    const selectedSource = sources.find(s => s.id === videoSourceSelect.value);
    if (selectedSource) {
      try {
        const systemAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: selectedSource.id,
            }
          },
          video: false
        });
        systemAudioStream.getAudioTracks().forEach(track => audioTracks.push(track));
        console.log("System audio captured.");
      } catch (e) {
        console.error("Error capturing system audio:", e);
      }
    }
  }

  // If the microphone toggle is checked, capture microphone audio.
  if (micToggle.checked) {
    console.log("Microphone enabled.");
    const micId = micSourceSelect.value;
    try {
      const micAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: false
      });
      micAudioStream.getAudioTracks().forEach(track => audioTracks.push(track));
      console.log("Microphone audio captured.");
    } catch (e) {
      console.error("Error capturing microphone audio:", e);
    }
  }

  // Combine the video track(s) and all audio tracks.
  let combinedTracks = [];
  if (videoStream) {
    combinedTracks = combinedTracks.concat(videoStream.getVideoTracks());
  }
  combinedTracks = combinedTracks.concat(audioTracks);
  const combinedStream = new MediaStream(combinedTracks);

  try {
    mediaRecorder = new MediaRecorder(combinedStream);
  } catch (e) {
    console.error("Error creating MediaRecorder:", e);
    return;
  }

  recordedChunks = [];
  mediaRecorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    console.log("Recording stopped. Processing data...");
    const blob = new Blob(recordedChunks, { type: 'video/webm; codecs=vp9' });
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { filePath } = await ipcRenderer.invoke('save-dialog', buffer);
    if (filePath) {
      console.log('Video saved to:', filePath);
    }
    recordedChunks = [];
  };

  mediaRecorder.start();
  isRecording = true;
  startStopBtn.textContent = 'Stop Recording';
  startStopBtn.classList.remove('bg-green-500');
  startStopBtn.classList.add('bg-red-500');
  startTimer();
}

// Stop recording.
function stopRecording() {
  console.log("Stopping recording...");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
  }
  // (Audio tracks from getUserMedia used in recording will be stopped when recorder stops.)
  isRecording = false;
  startStopBtn.textContent = 'Start Recording';
  startStopBtn.classList.remove('bg-red-500');
  startStopBtn.classList.add('bg-green-500');
  clearInterval(timerInterval);
  seconds = 0;
  timerDisplay.textContent = '00:00';
}

// Timer function.
function startTimer() {
  timerInterval = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const secondsLeft = seconds % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;
  }, 1000);
}

// Quit the app.
quitBtn.addEventListener('click', () => {
  ipcRenderer.send('quit-recording');
  window.close();
});

// When the video source selection changes, update the preview.
videoSourceSelect.addEventListener('change', (e) => {
  const sourceId = e.target.value;
  if (sourceId) {
    previewSelectedSource(sourceId);
  }
});

// On page load, fetch sources and populate the microphone list.
getSources();
populateMicrophones();

// Bind the start/stop recording button.
startStopBtn.addEventListener('click', toggleRecording);
