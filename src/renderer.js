const { ipcRenderer } = require('electron');
const { writeFile } = require('fs');

const startStopBtn = document.getElementById('startStopBtn');
const quitBtn = document.getElementById('quitBtn');
const videoSourceSelect = document.getElementById('videoSource');
const micSourceSelect = document.getElementById('micSource');
const preview = document.getElementById('preview');
const timerDisplay = document.getElementById('timer');
const soundToggle = document.getElementById('soundToggle');
const micToggle = document.getElementById('micToggle');

let mediaRecorder;
let videoStream;
let audioStream;
let recordedChunks = [];
let isRecording = false;
let enableAudio = false;
let selectedSourceId = '';
let timerInterval;
let seconds = 0;

/** 
 * Get available video sources.
 */
async function getSources() {
  console.log("Fetching video sources...");
  const sources = await ipcRenderer.invoke('get-sources');
  sources.forEach(source => {
    const videoOption = document.createElement('option');
    videoOption.value = source.id;
    videoOption.textContent = source.name;
    videoSourceSelect.appendChild(videoOption);
  });
}


/**
 * Get available microphones.
 */
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

/**
 * Preview the selected source.
 */
async function previewSelectedSource(sourceId) {
    const sources = await ipcRenderer.invoke('get-sources');
    const selectedSource = sources.find(s => s.id === sourceId);
    if (!selectedSource) {
        console.error("No source found for id", sourceId);
        return;
    }
    selectedSourceId = selectedSource.id;

    const constraints = {
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedSource.id,
            }
        },
        audio: !soundToggle.checked ? false : {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedSource.id,
                echoCancellation: false
            }
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    preview.srcObject = stream;
    videoStream = stream;
}

/**
 * Start recording the selected source.
 */
async function startRecording() {
  if (!videoStream) {
    console.error("No video stream available.");
    return;
  }
  enableAudio = soundToggle.checked;
  stopTracks();
  await previewSelectedSource(selectedSourceId);

  let audioTracks = [];
  
  if (soundToggle.checked) {
    videoStream.getAudioTracks().forEach(track => audioTracks.push(track));
  }
  if (micToggle.checked) {
    const micId = micSourceSelect.value;
    try {
      const micAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: micId ? { deviceId: { exact: micId } } : true,
        video: false,
        echoCancellation: true
      });
      micAudioStream.getAudioTracks().forEach(track => audioTracks.push(track));
      console.log("Microphone audio captured.");
    } catch (e) {
      console.error("Error capturing microphone audio:", e);
    }
  }

  const combinedTracks = [];
  if (videoStream) {
    combinedTracks.push(...videoStream.getVideoTracks());
  }

  if (audioTracks && audioTracks.length > 0) {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    if (audioTracks.length > 0 && audioTracks[0]) {
      const systemAudioSource = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      systemAudioSource.connect(destination);
    }
    if (audioTracks.length > 1 && audioTracks[1]) {
      const micAudioSource = audioContext.createMediaStreamSource(new MediaStream([audioTracks[1]]));
      micAudioSource.connect(destination);
    }
    audioStream = destination.stream;
    combinedTracks.push(...audioStream.getAudioTracks());
  }

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

  mediaRecorder.start();
  isRecording = true;
  startStopBtn.textContent = 'Stop Recording';
  startStopBtn.classList.remove('bg-green-500');
  startStopBtn.classList.add('bg-red-500');
  startTimer();
}

function stopTracks() {
  try {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
    }
  }
  catch (e) {
    console.log('Error stopping tracks', e)
  }
}

async function saveRecording() {
  if (recordedChunks.length == 0) return;
  try {
    const blob = new Blob(recordedChunks, { type: 'video/webm; codecs=vp9' });
    const buffer = Buffer.from(await blob.arrayBuffer());
    await ipcRenderer.invoke('save-dialog', buffer);
    recordedChunks = [];
  } catch (e) {
    console.log('Error saving recording', e)
  }
}

async function stopRecording() {
  console.log("Stopping recording...");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    const stopPromise = new Promise(resolve => {
      mediaRecorder.onstop = resolve;
    });
    mediaRecorder.stop();
    await stopPromise;
  }
  stopTracks();
  isRecording = false;
  startStopBtn.textContent = 'Start Recording';
  startStopBtn.classList.remove('bg-red-500');
  startStopBtn.classList.add('bg-green-500');
  clearInterval(timerInterval);
  seconds = 0;
  timerDisplay.textContent = '00:00';
  await saveRecording();
  await previewSelectedSource(selectedSourceId);
}

function startTimer() {
  timerInterval = setInterval(() => {
    seconds++;
    const minutes = Math.floor(seconds / 60);
    const secondsLeft = seconds % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`;
  }, 1000);
}

quitBtn.addEventListener('click', () => {
  ipcRenderer.send('quit-recording');
  window.close();
});

videoSourceSelect.addEventListener('change', (e) => {
  const sourceId = e.target.value;
  if (sourceId) {
    previewSelectedSource(sourceId);
  }
});

getSources();
populateMicrophones();

function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

startStopBtn.addEventListener('click', toggleRecording);
