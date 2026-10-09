# Distributed Video Transcoder

A backend video transcoding service built with **Node.js, Express, Multer, and FFmpeg**.

The current version provides a simple synchronous API for uploading a video and transcoding it to 720p.

## Current Architecture

```text
Client
  │
  │ POST /transcode
  ▼
Express API
  │
  ▼
Multer
  │
  ▼
uploads/
  │
  ▼
FFmpeg
  │
  ▼
outputs/output.mp4
```

## Tech Stack

* Node.js
* Express.js
* Multer
* FFmpeg
* JavaScript (ES Modules)

## Features

* Video file upload using `multipart/form-data`
* Video processing with FFmpeg
* 720p video transcoding
* Asynchronous FFmpeg process handling
* Simple REST API

## Project Structure

```text
distributed-video-transcoder/
├── src/
│   ├── constants.js
│   ├── server.js
│   ├── routes/
│   │   └── transcode.routes.js
│   └── services/
│       └── transcode.service.js
├── uploads/
├── outputs/
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd distributed-video-transcoder
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install FFmpeg

FFmpeg must be installed separately and available in the system `PATH`.

Verify the installation:

```bash
ffmpeg -version
```

### 4. Configure environment variables

Create a `.env` file:

```env
PORT=3000
```

### 5. Start the server

```bash
npm start
```

The API will run on:

```text
http://localhost:3000
```

## API

### Transcode Video

**POST**

```text
/transcode
```

Send the video as a `multipart/form-data` field named:

```text
video
```

Example using cURL:

```bash
curl -X POST \
  -F "video=@input.mp4" \
  http://localhost:3000/transcode
```

The uploaded video is stored in `uploads/` and the transcoded output is generated at:

```text
outputs/output.mp4
```

## Current Limitations

This is the initial MVP. It currently uses:

* Synchronous request-based transcoding
* A single server
* A fixed output filename
* Local filesystem storage
* No authentication
* No job queue
* No distributed workers

These limitations will be addressed as the system evolves.

## Planned Architecture

The project will gradually evolve into a distributed video processing system.

Planned components include:

* Authentication and authorization
* Job management
* Asynchronous processing
* RabbitMQ
* Distributed FFmpeg workers
* Job status tracking
* Retry handling
* Dead-letter queues
* Object storage
* Horizontal worker scaling

## Goal

The goal of this project is to progressively build a production-style distributed video processing system while understanding the underlying backend, operating system, networking, messaging, and distributed-system concepts.
