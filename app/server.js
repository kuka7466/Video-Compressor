const express = require('express');
const multer = require('multer');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Use statically compiled binaries from npm
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

const app = express();
const PORT = process.env.PORT || 3000;

let FFMPEG_PATH = ffmpegInstaller.path;
let FFPROBE_PATH = ffprobeInstaller.path;

console.log(`Resolved FFmpeg binary path: ${FFMPEG_PATH}`);
console.log(`Resolved FFprobe binary path: ${FFPROBE_PATH}`);


// In-memory jobs store
const jobs = {};
const clients = {}; // jobId -> Array of SSE responses

// Setup directories
const uploadDir = path.join(__dirname, 'uploads');
const convertedDir = path.join(__dirname, 'converted');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(convertedDir)) {
  fs.mkdirSync(convertedDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Clean up old files (older than 30 minutes) every 10 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 mins
  
  [uploadDir, convertedDir].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > maxAge) {
            fs.unlink(filePath, (err) => {
              if (!err) console.log(`Deleted stale file: ${file}`);
            });
            // Clean up corresponding job from store
            const jobId = path.basename(file, path.extname(file));
            if (jobs[jobId]) {
              delete jobs[jobId];
            }
          }
        });
      });
    });
  });
}, 10 * 60 * 1000);

// Fetch video metadata using FFprobe
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    const args = ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration,r_frame_rate', '-show_entries', 'format=size,duration,bit_rate', '-of', 'json', filePath];
    execFile(FFPROBE_PATH, args, (error, stdout, stderr) => {
      if (error) {
        console.error('[FFprobe Error] Primary probe failed:', error.message);
        // Fallback for audio-only or unsupported video structures
        const fallbackArgs = ['-v', 'error', '-show_entries', 'format=size,duration,bit_rate', '-of', 'json', filePath];
        execFile(FFPROBE_PATH, fallbackArgs, (fallbackError, fallbackStdout) => {
          if (fallbackError) {
            console.error('[FFprobe Error] Fallback probe failed:', fallbackError.message);
            reject(new Error('Failed to parse video metadata.'));
          } else {
            try {
              const data = JSON.parse(fallbackStdout);
              resolve({
                width: null,
                height: null,
                duration: parseFloat(data.format?.duration || 0),
                size: parseInt(data.format?.size || 0),
                bitrate: parseInt(data.format?.bit_rate || 0),
                fps: null
              });
            } catch (e) {
              reject(e);
            }
          }
        });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const stream = data.streams?.[0] || {};
        const format = data.format || {};

        // Parse fps ratio (e.g. "30/1" or "24000/1001")
        let fps = null;
        if (stream.r_frame_rate) {
          const parts = stream.r_frame_rate.split('/');
          if (parts.length === 2 && parseFloat(parts[1]) !== 0) {
            fps = Math.round((parseFloat(parts[0]) / parseFloat(parts[1])) * 100) / 100;
          }
        }

        resolve({
          width: stream.width || null,
          height: stream.height || null,
          duration: parseFloat(stream.duration || format.duration || 0),
          size: parseInt(format.size || 0),
          bitrate: parseInt(format.bit_rate || 0),
          fps: fps
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

// 1. Upload video endpoint
app.post('/api/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const jobId = path.basename(req.file.filename, path.extname(req.file.filename));
  
  try {
    const metadata = await getVideoMetadata(req.file.path);
    jobs[jobId] = {
      id: jobId,
      status: 'pending',
      progress: 0,
      originalName: req.file.originalname,
      originalSize: req.file.size,
      inputPath: req.file.path,
      metadata: metadata,
      process: null
    };

    res.json({
      jobId: jobId,
      metadata: {
        name: req.file.originalname,
        size: req.file.size,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        bitrate: metadata.bitrate
      }
    });
  } catch (error) {
    console.error('[Upload API Error] Video metadata parsing failed:', error);
    // Cleanup upload on metadata parsing error
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Could not inspect video file. Please verify it is a valid video.' });
  }
});

// 2. Start conversion job
app.post('/api/jobs/:id/start', (req, res) => {
  const jobId = req.params.id;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (job.status === 'processing') {
    return res.status(400).json({ error: 'Job is already processing.' });
  }

  const { targetFormat, compressionMode, resolutionScale, audioOption, customBitrate, hardwareAcceleration } = req.body;

  // Determine output extension
  let outExt = '.mp4';
  if (targetFormat === 'mkv') outExt = '.mkv';
  else if (targetFormat === 'webm') outExt = '.webm';
  else if (targetFormat === 'mp3') outExt = '.mp3';

  const outputFilename = `${jobId}${outExt}`;
  const outputPath = path.join(convertedDir, outputFilename);

  job.outputFilename = outputFilename;
  job.outputPath = outputPath;
  job.status = 'processing';

  const startEncoding = (useHwAccel) => {
    // Build FFmpeg arguments
    const args = ['-y', '-i', job.inputPath];

    let vcodec = null;

    if (targetFormat === 'mp3') {
      args.push('-vn', '-acodec', 'libmp3lame');
      const kbps = compressionMode === 'high' ? '320k' : (compressionMode === 'max' ? '128k' : '192k');
      args.push('-b:a', kbps);
    } else {
      vcodec = 'libx264';
      if (targetFormat === 'mkv') {
        vcodec = 'libx265';
      } else if (targetFormat === 'webm') {
        vcodec = 'libvpx-vp9';
      }

      // Apply hardware acceleration if requested and applicable (not mp3/webm usually, but we'll map mp4/mkv)
      if (useHwAccel && useHwAccel !== 'cpu' && (targetFormat === 'mp4' || targetFormat === 'mkv')) {
        if (useHwAccel === 'nvenc') {
          vcodec = targetFormat === 'mkv' ? 'hevc_nvenc' : 'h264_nvenc';
        } else if (useHwAccel === 'amf') {
          vcodec = targetFormat === 'mkv' ? 'hevc_amf' : 'h264_amf';
        } else if (useHwAccel === 'qsv') {
          vcodec = targetFormat === 'mkv' ? 'hevc_qsv' : 'h264_qsv';
        }
      }

      args.push('-vcodec', vcodec);

      if (compressionMode === 'custom' && customBitrate) {
        args.push('-b:v', `${customBitrate}k`);
        if (vcodec.includes('264') || vcodec.includes('265') || vcodec.includes('nvenc') || vcodec.includes('amf') || vcodec.includes('qsv')) {
          args.push('-maxrate', `${customBitrate * 1.5}k`, '-bufsize', `${customBitrate * 2}k`);
        }
      } else {
        let crf = 23;
        if (vcodec.includes('264') || vcodec.includes('nvenc') || vcodec.includes('amf') || vcodec.includes('qsv')) {
          crf = compressionMode === 'high' ? 18 : (compressionMode === 'max' ? 28 : 23);
        } else if (vcodec.includes('265') || vcodec.includes('hevc')) {
          crf = compressionMode === 'high' ? 20 : (compressionMode === 'max' ? 32 : 28);
        } else if (vcodec === 'libvpx-vp9') {
          crf = compressionMode === 'high' ? 25 : (compressionMode === 'max' ? 40 : 32);
          args.push('-b:v', '0');
        }

        if (vcodec.includes('nvenc') || vcodec.includes('amf') || vcodec.includes('qsv')) {
           if (vcodec.includes('nvenc')) {
             args.push('-cq', crf.toString());
             args.push('-preset', 'hq');
           } else {
             args.push('-crf', crf.toString());
           }
        } else {
          args.push('-crf', crf.toString());
        }
      }

      if (vcodec === 'libx264' || vcodec === 'libx265' || vcodec.includes('nvenc') || vcodec.includes('amf') || vcodec.includes('qsv')) {
        args.push('-pix_fmt', 'yuv420p');
      }

      if (audioOption === 'mute') {
        args.push('-an');
      } else {
        args.push('-acodec', 'aac');
      }

      if (resolutionScale && resolutionScale !== 'original') {
        let maxW = 1920;
        if (resolutionScale === '720p') maxW = 1280;
        else if (resolutionScale === '480p') maxW = 854;

        args.push('-vf', `scale='min(${maxW},iw)':-2`);
      }
    }

    args.push(outputPath);

    console.log(`[FFmpeg] Starting encoding job ${jobId} using codec: ${vcodec || 'libmp3lame (Audio)'}`);

    // Spawn FFmpeg process
    const ffmpegProcess = spawn(FFMPEG_PATH, args);
    job.process = ffmpegProcess;

    const totalDuration = job.metadata.duration || 0;

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();

      // Parse FFmpeg progress patterns
      const timeMatch = output.match(/time=\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      const speedMatch = output.match(/speed=\s*([\d.]+)x/);
      const fpsMatch = output.match(/fps=\s*([\d.]+)/);

      if (timeMatch && totalDuration > 0) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        const centiseconds = parseInt(timeMatch[4], 10);
        
        const currentSeconds = (hours * 3600) + (minutes * 60) + seconds + (centiseconds / 100);
        const progress = Math.min(99, Math.round((currentSeconds / totalDuration) * 100));
        
        job.progress = progress;
        job.speed = speedMatch ? `${speedMatch[1]}x` : job.speed || '1x';
        job.fps = fpsMatch ? Math.round(parseFloat(fpsMatch[1])) : job.fps || 0;

        let eta = 'calculating...';
        if (speedMatch) {
          const speedVal = parseFloat(speedMatch[1]);
          if (speedVal > 0) {
            const remainingSeconds = (totalDuration - currentSeconds) / speedVal;
            if (remainingSeconds > 0) {
              const etaMin = Math.floor(remainingSeconds / 60);
              const etaSec = Math.floor(remainingSeconds % 60);
              eta = etaMin > 0 ? `${etaMin}m ${etaSec}s` : `${etaSec}s`;
            } else {
              eta = '0s';
            }
          }
        }
        job.eta = eta;

        sendProgressUpdate(jobId, {
          status: 'processing',
          progress: job.progress,
          speed: job.speed,
          fps: job.fps,
          eta: job.eta
        });
      }
    });

    ffmpegProcess.on('close', (code) => {
      job.process = null;

      if (code === 0) {
        fs.unlink(job.inputPath, () => {});
        try {
          const stats = fs.statSync(outputPath);
          job.status = 'completed';
          job.progress = 100;
          job.compressedSize = stats.size;

          sendProgressUpdate(jobId, {
            status: 'completed',
            progress: 100,
            originalSize: job.originalSize,
            compressedSize: stats.size,
            downloadUrl: `/api/download/${jobId}`,
            copyError: null
          });
        } catch (err) {
          job.status = 'failed';
          job.error = 'Output file could not be read.';
          sendProgressUpdate(jobId, {
            status: 'failed',
            error: job.error
          });
        }
      } else {
        if (useHwAccel && useHwAccel !== 'cpu' && job.status !== 'cancelled') {
           console.log(`[FFmpeg] GPU Encoder (${useHwAccel}) failed. Falling back to CPU...`);
           if (fs.existsSync(outputPath)) {
             fs.unlinkSync(outputPath);
           }
           startEncoding('cpu');
           return; // Do not terminate SSE clients, wait for fallback to finish
        } else {
          fs.unlink(job.inputPath, () => {});
          if (job.status !== 'cancelled') {
            job.status = 'failed';
            job.error = 'FFmpeg encoding process failed.';
            sendProgressUpdate(jobId, {
              status: 'failed',
              error: job.error
            });
          }
        }
      }

      if (clients[jobId]) {
        clients[jobId].forEach(res => res.end());
        delete clients[jobId];
      }
    });
  };

  startEncoding(hardwareAcceleration);

  res.json({ success: true, message: 'Compression started.' });
});

// 3. SSE Progress stream endpoint
app.get('/api/jobs/:id/progress', (req, res) => {
  const jobId = req.params.id;
  const job = jobs[jobId];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  if (job) {
    res.write(`data: ${JSON.stringify({
      status: job.status,
      progress: job.progress,
      speed: job.speed || '0x',
      fps: job.fps || 0,
      eta: job.eta || 'calculating...',
      originalSize: job.originalSize,
      compressedSize: job.compressedSize || 0,
      downloadUrl: job.status === 'completed' ? `/api/download/${jobId}` : null,
      error: job.error || null
    })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
    return res.end();
  }

  // Register client
  if (!clients[jobId]) {
    clients[jobId] = [];
  }
  clients[jobId].push(res);

  req.on('close', () => {
    if (clients[jobId]) {
      clients[jobId] = clients[jobId].filter(client => client !== res);
      if (clients[jobId].length === 0) {
        delete clients[jobId];
      }
    }
  });
});

// Helper to broadcast progress updates to all connected clients
function sendProgressUpdate(jobId, data) {
  if (clients[jobId]) {
    clients[jobId].forEach(res => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

// 4. Cancel conversion job
app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobId = req.params.id;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ error: 'Job not found.' });
  }

  if (job.process) {
    job.status = 'cancelled';
    job.process.kill('SIGKILL');
    
    // Cleanup temporary files
    fs.unlink(job.inputPath, () => {});
    if (job.outputPath && fs.existsSync(job.outputPath)) {
      fs.unlink(job.outputPath, () => {});
    }

    sendProgressUpdate(jobId, { status: 'cancelled' });
    res.json({ success: true, message: 'Compression process cancelled.' });
  } else {
    res.status(400).json({ error: 'Job is not processing.' });
  }
});

// 5. Download compressed file endpoint
app.get('/api/download/:id', (req, res) => {
  const jobId = req.params.id;
  const job = jobs[jobId];

  if (!job || job.status !== 'completed' || !job.outputPath) {
    return res.status(404).send('<h1>File not found or conversion incomplete.</h1>');
  }

  const filename = `${path.basename(job.originalName, path.extname(job.originalName))}_compressed${path.extname(job.outputFilename)}`;
  
  res.download(job.outputPath, filename, (err) => {
    if (!err) {
      // Opt-in immediate cleanup after successful download to keep disk spotless!
      setTimeout(() => {
        fs.unlink(job.outputPath, () => {});
        delete jobs[jobId];
      }, 5000); // Wait 5 seconds to ensure stream fully finishes
    }
  });
});
// 6. Instant cache cleanup endpoint
app.post('/api/clean', (req, res) => {
  let deletedCount = 0;
  const errors = [];
  const dirs = [uploadDir, convertedDir];
  let checkedDirs = 0;

  dirs.forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        checkedDirs++;
        if (checkedDirs === dirs.length) {
          return res.json({ success: true, deletedCount, errors });
        }
        return;
      }

      if (files.length === 0) {
        checkedDirs++;
        if (checkedDirs === dirs.length) {
          return res.json({ success: true, deletedCount, errors });
        }
        return;
      }

      let deletedInDir = 0;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const jobId = path.basename(file, path.extname(file));
        const activeJob = jobs[jobId];
        
        // Skip deleting active processing files
        if (activeJob && activeJob.status === 'processing') {
          deletedInDir++;
          if (deletedInDir === files.length) {
            checkedDirs++;
            if (checkedDirs === dirs.length) {
              return res.json({ success: true, deletedCount, errors });
            }
          }
          return;
        }

        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) {
            errors.push(`Failed to delete ${file}`);
          } else {
            deletedCount++;
            if (jobs[jobId]) delete jobs[jobId];
          }
          
          deletedInDir++;
          if (deletedInDir === files.length) {
            checkedDirs++;
            if (checkedDirs === dirs.length) {
              return res.json({ success: true, deletedCount, errors });
            }
          }
        });
      });
    });
  });
});

// 7. Server Shutdown Endpoint - REMOVED DUE TO DOS VULNERABILITY

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  // Automatically open browser on Windows platform
  try {
    exec(`start http://localhost:${PORT}`);
  } catch (err) {
    console.warn(`Could not open browser automatically: ${err.message}`);
  }
});

