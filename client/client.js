const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

// --- Configuration ---
const CLIENT_ID = 'client-123';
const MQTT_BROKER_URL = 'mqtt://broker:1883';
const SERVER_CHUNK_URL = 'http://server:3000/upload-chunk';
const SERVER_COMPLETE_URL = 'http://server:3000/upload-complete';
const COMMAND_TOPIC = `clients/${CLIENT_ID}/commands`;

// --- NEW CONFIG ---
const API_KEY = 'my-super-secret-key-12345'; // Must match the server
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const FILE_PATH = path.join(__dirname, 'dummy-file.txt');
// On Linux/macOS: truncate -s 100M dummy-file.txt
// On Windows: fsutil file createnew dummy-file.txt 104857600


// --- MQTT Connection (Same as before) ---
console.log(`[Client] Connecting to MQTT broker at ${MQTT_BROKER_URL}...`);
const client = mqtt.connect(MQTT_BROKER_URL);
// ... (client.on 'connect' and 'message' are the same) ...
client.on('connect', () => {
  console.log('[Client] Connected to MQTT broker.');
  client.subscribe(COMMAND_TOPIC, (err) => {
    if (!err) {
      console.log(`[Client] Subscribed to topic: ${COMMAND_TOPIC}`);
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`[Client] Received message on topic '${topic}': ${message.toString()}`);
  try {
    const command = JSON.parse(message.toString());
    if (command.action === 'request_file_upload') {
      console.log('[Client] Received file upload request. Starting upload...');
      uploadFileInChunks();
    }
  } catch (e) {
    console.error('[Client] Error parsing message:', e);
  }
});

// --- Helper to create auth headers ---
function getAuthConfig() {
  return {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    timeout: 10000, // 10 second timeout
  };
}

// --- Helper for calculating file hash ---
function getFileHash(filePath) {
  console.log('[Client] Calculating file hash (SHA256)... This may take a moment.');
  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  console.log(`[Client] File hash is: ${hash}`);
  return hash;
}

// --- UPDATED UPLOAD FUNCTION ---
async function uploadFileInChunks() {
  const transferId = crypto.randomUUID();
  const fileStats = fs.statSync(FILE_PATH);
  const fileSize = fileStats.size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  const originalFilename = path.basename(FILE_PATH);
  const fullFileHash = getFileHash(FILE_PATH);

  console.log(`[Client] Starting upload: ${originalFilename}`);
  console.log(`[Client] Transfer ID: ${transferId}, Total Chunks: ${totalChunks}`);

  const fileHandle = await fs.promises.open(FILE_PATH, 'r');
  
  for (let i = 0; i < totalChunks; i++) {
    const chunkBuffer = Buffer.alloc(CHUNK_SIZE);
    const offset = i * CHUNK_SIZE;
    const { bytesRead } = await fileHandle.read(chunkBuffer, 0, CHUNK_SIZE, offset);
    const finalChunk = chunkBuffer.subarray(0, bytesRead);

    const form = new FormData();
    form.append('transferId', transferId);
    form.append('chunkIndex', i.toString());
    form.append('file', finalChunk, { filename: `chunk_${i}` });

    // --- NEW RETRY LOGIC ---
    let success = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Client] Uploading chunk ${i + 1}/${totalChunks} (Attempt ${attempt})...`);
        const config = {
          headers: {
            ...form.getHeaders(),
            ...getAuthConfig().headers, // Add auth header
          },
          timeout: getAuthConfig().timeout, // Add timeout
        };
        await axios.post(SERVER_CHUNK_URL, form, config);
        success = true;
        break; // Success! Exit the retry loop
      } catch (err) {
        console.error(`[Client] Error uploading chunk ${i} (Attempt ${attempt}):`, err.message);
        if (attempt === MAX_RETRIES) {
          console.error('[Client] Max retries reached. Aborting upload.');
          await fileHandle.close();
          return; // Stop on final failure
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); // Wait before retrying
      }
    }
  }
  
  await fileHandle.close();
  console.log('[Client] All chunks uploaded. Finalizing transfer...');

  try {
    // Send the "complete" signal with the hash
    await axios.post(SERVER_COMPLETE_URL, {
      transferId,
      totalChunks: totalChunks.toString(),
      originalFilename,
      fullFileHash, // <-- Send the hash for verification
    }, getAuthConfig()); // Use auth for this call too

    console.log('[Client] File transfer complete and verified by server!');
  } catch (err) {
    console.error('[Client] Error finalizing transfer:', err.message);
  }
}

client.on('error', (err) => {
    console.error('[Client] MQTT Connection Error:', err);
});