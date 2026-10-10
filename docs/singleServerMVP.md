# Distributed Video Transcoder

## MVP v1 — Technical Documentation and Architecture Baseline

**Project:** Distributed Video Transcoder
**Current milestone:** Single-server synchronous video transcoding
**Implementation status:** Core upload → transcode → download flow implemented and tested
**Primary stack:** Node.js, Express, Multer, FFmpeg
**Architecture:** Single Node.js server with local filesystem storage and local FFmpeg subprocesses

---

# 1. Project Overview

## 1.1 What the project does

Distributed Video Transcoder is a backend system that accepts video uploads, converts them into a user-selected resolution, and allows clients to download the resulting video.

The current implementation runs entirely on one machine. Express handles HTTP requests, Multer processes incoming multipart uploads, and FFmpeg performs the actual video transcoding.

The current system supports three target resolutions:

* 480p — 480 pixels high
* 720p — 720 pixels high
* 1080p — 1080 pixels high

The client can choose a target resolution for each upload. If no resolution is provided, the application defaults to 720p.

The single-server implementation is the foundation for the next phase: moving transcoding into independent workers and distributing jobs through a message queue.

## 1.2 Current objectives

The current MVP establishes these capabilities:

1. Accept video uploads through an HTTP API.
2. Apply an upload size limit.
3. Reject unsupported MIME types.
4. Validate the requested output resolution.
5. Transcode videos using FFmpeg.
6. Generate unique output filenames.
7. Return information about the generated output.
8. Allow clients to download the output.
9. Clean up uploaded files and partial outputs when appropriate.
10. Separate HTTP routing from the transcoding service.

## 1.3 What the MVP does not do yet

The following capabilities are outside the current implementation:

* RabbitMQ or another job queue.
* Independent FFmpeg workers.
* Asynchronous job submission.
* A job-status endpoint.
* Persistent job metadata.
* Multi-server coordination.
* Automatic retries and dead-letter queues.
* HLS adaptive bitrate streaming.
* Automatic generation of several resolutions from one upload.
* Production deployment and full security hardening.

These are future development milestones, not prerequisites for considering the single-server MVP functional.

---

# 2. Current Architecture

## 2.1 Architecture diagram

```text
                 CLIENT
                   |
                   | POST /transcode
                   | multipart/form-data
                   v
           EXPRESS HTTP SERVER
                   |
                   v
           MULTER UPLOAD MIDDLEWARE
                   |
                   | Validate upload size
                   | Validate MIME type
                   | Save temporary upload
                   v
          UPLOADS DIRECTORY
                   |
                   v
          TRANSCODE ROUTE HANDLER
                   |
                   | Validate resolution
                   | Generate unique job ID
                   | Determine output path
                   v
          TRANSCODE SERVICE
                   |
                   | spawn("ffmpeg", args)
                   v
             FFMPEG PROCESS
                   |
                   | Read input video
                   | Scale to target height
                   | Encode output video
                   v
          OUTPUTS DIRECTORY
                   |
                   v
          HTTP RESPONSE TO CLIENT
                   |
                   | jobId
                   | output filename
                   v
                 CLIENT

       Later: GET /download/:filename
                   |
                   v
          OUTPUTS DIRECTORY
                   |
                   v
           VIDEO DOWNLOAD
```

The diagram represents the current synchronous flow. The client waits for transcoding to finish before receiving the successful response.

## 2.2 Architectural responsibilities

| Component           | Responsibility                                     |
| ------------------- | -------------------------------------------------- |
| Express             | HTTP server and routing                            |
| Multer              | Multipart upload parsing and disk storage          |
| Route handler       | Input validation, orchestration, response handling |
| Constants module    | Shared upload-size and resolution constants        |
| Transcoding service | Starts FFmpeg and reports process completion       |
| FFmpeg              | Actual video decoding, scaling and encoding        |
| `uploads/`          | Temporary source videos                            |
| `outputs/`          | Transcoded video files                             |
| Local filesystem    | Stores input and output files                      |

The central design decision is that the route handler does not implement video encoding itself. It calls a dedicated service that manages the FFmpeg subprocess.

---

# 3. Current Project Structure

```text
distributed-video-transcoder/
│
├── src/
│   ├── constants.js
│   ├── server.js
│   │
│   ├── routes/
│   │   └── transcode.routes.js
│   │
│   └── services/
│       └── transcode.service.js
│
├── uploads/
├── outputs/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## 3.1 `src/server.js`

**Purpose:** Application entry point.

Responsibilities:

* Loads environment variables through `dotenv/config`.
* Imports Express.
* Imports the transcoding router.
* Creates the Express application.
* Creates the `uploads/` and `outputs/` directories if they do not exist.
* Mounts the transcoding router.
* Starts the HTTP server on the configured port.

The directory initialization uses:

```js
await mkdir("outputs", { recursive: true });
await mkdir("uploads", { recursive: true });
```

The `recursive: true` option means the directory can already exist without causing an error.

The server startup sequence is conceptually:

```text
Load environment
      ↓
Create Express app
      ↓
Ensure required directories exist
      ↓
Register routes
      ↓
Start listening
```

**Important:** These relative directory paths are resolved from the Node.js process's current working directory. The application should be started consistently from the project root.

## 3.2 `src/constants.js`

**Purpose:** Central location for application constants.

The upload-size limit is defined in bytes because Multer expects a byte count.

The current configuration is:

```env
PORT=3000
MAX_UPLOAD_SIZE_MB=1024
```

The corresponding constant is:

```js
export const MAX_UPLOAD_SIZE =
    Number(process.env.MAX_UPLOAD_SIZE_MB || 1024) *
    1024 *
    1024;
```

This means the default limit is 1,024 MiB, equivalent to 1 GiB.

The resolution mapping added to this file is:

```js
export const RESOLUTIONS = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080
};
```

The mapping separates the resolution label sent by the client from the numeric height used by FFmpeg.

For example:

```js
RESOLUTIONS["1080p"] // 1080
```

This also gives the route a central list of supported resolution choices instead of scattering hardcoded values throughout the application.

## 3.3 `src/routes/transcode.routes.js`

**Purpose:** HTTP API and request orchestration.

This is the primary API layer. It is responsible for accepting requests, validating inputs, invoking the transcoding service, cleaning up files, and returning responses.

Its responsibilities include:

* Configuring Multer.
* Filtering upload MIME types.
* Enforcing the upload-size limit.
* Translating upload errors into HTTP responses.
* Validating the requested resolution.
* Creating a unique job ID.
* Constructing the output path.
* Calling the transcoding service.
* Handling transcoding failures.
* Deleting temporary files.
* Exposing the download endpoint.

The route should not contain FFmpeg process-management logic directly. That belongs in the service module.

## 3.4 `src/services/transcode.service.js`

**Purpose:** Encapsulates FFmpeg execution.

This module accepts an input path, an output path, and a target height. It starts FFmpeg as a child process and returns a Promise that settles when the process finishes.

Its responsibilities include:

* Constructing FFmpeg arguments.
* Starting FFmpeg using `spawn()`.
* Detecting process errors.
* Checking the exit code.
* Resolving on successful completion.
* Rejecting on unsuccessful completion.

This separation allows the HTTP layer to use:

```js
await transcode(inputPath, outputPath, height);
```

without needing to know how FFmpeg's process events work.

## 3.5 `uploads/`

Stores temporary source videos saved by Multer.

The route removes the uploaded source file in its `finally` block after the transcoding attempt finishes.

This is temporary working storage, not permanent video storage.

## 3.6 `outputs/`

Stores successfully transcoded videos.

The current output filename is based on a UUID, for example:

```text
outputs/550e8400-e29b-41d4-a716-446655440000.mp4
```

The UUID makes filename collisions highly unlikely when different requests are processed.

Failed transcoding attempts trigger cleanup of partial output files.

## 3.7 `.env` and `.env.example`

`.env` holds local environment-specific values, such as the server port and upload-size limit.

`.env.example` documents the expected configuration variables for someone setting up the project.

The actual `.env` file should not be committed if it contains local secrets or machine-specific configuration.

## 3.8 `.gitignore`

Should exclude generated or machine-specific content, including:

* `node_modules/`
* `.env`
* Uploaded videos
* Generated output videos
* Other temporary files

The exact existing ignore patterns should be checked against the repository.

## 3.9 `package.json`

Defines the Node.js project, dependencies, and npm scripts.

The project uses ECMAScript modules, indicated by:

```json
{
  "type": "module"
}
```

Local module imports therefore use ES module syntax, including file extensions:

```js
import { transcode } from "../services/transcode.service.js";
```

The application also requires FFmpeg to be installed and available through the system `PATH`. Installing the npm dependencies alone does not install the FFmpeg executable.

---

# 4. Environment Configuration

The current `.env` values are:

```env
PORT=3000
MAX_UPLOAD_SIZE_MB=1024
```

| Variable             | Purpose                    | Current value |
| -------------------- | -------------------------- | ------------- |
| `PORT`               | HTTP server port           | `3000`        |
| `MAX_UPLOAD_SIZE_MB` | Maximum upload size in MiB | `1024`        |

The application loads environment values using `dotenv/config`.

The upload-size constant converts the configured value into bytes:

$$
\text{MAX\_UPLOAD\_SIZE}
=
\text{MAX\_UPLOAD\_SIZE\_MB}
\times 1024^2
$$

This keeps the configuration readable while supplying Multer with the unit it expects.

---

# 5. Video Upload and Validation

## 5.1 Multer configuration

The upload middleware uses disk storage:

```js
const upload = multer({
    dest: "uploads/",
    limits: {
        fileSize: MAX_UPLOAD_SIZE
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-matroska"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            callback(null, true);
        } else {
            callback(new Error("Unsupported video format"));
        }
    }
});
```

The `dest` property tells Multer to save uploaded files to `uploads/`.

The `limits.fileSize` property limits the size of each uploaded file.

The `fileFilter` callback accepts the MIME types listed above and rejects other declared types.

## 5.2 Accepted MIME types

| MIME type          | Intended format |
| ------------------ | --------------- |
| `video/mp4`        | MP4             |
| `video/webm`       | WebM            |
| `video/quicktime`  | MOV / QuickTime |
| `video/x-matroska` | Matroska / MKV  |

The MIME type is supplied as part of the upload request. Therefore, this is a basic filter, not definitive verification of the file's actual contents. FFmpeg may still reject a file that passes the filter.

## 5.3 Upload error handling

The application wraps Multer with a `handleUpload` middleware.

Its flow is:

```text
Incoming upload
      |
      v
Run Multer middleware
      |
      +-- No error ------> next()
      |
      +-- File too large -> HTTP 413
      |
      +-- Unsupported MIME -> HTTP 400
      |
      +-- Other Multer error -> HTTP 400
      |
      +-- Unexpected error -> next(error)
```

The `upload.single("video")` middleware expects one uploaded file under the multipart field name `video`.

The wrapper calls this middleware and receives its error through a callback. This makes it possible to translate Multer errors into the application's own JSON responses.

## 5.4 Current validation inventory

| Validation         | Behavior                                                |
| ------------------ | ------------------------------------------------------- |
| Required upload    | Missing file returns HTTP 400                           |
| Upload size        | Exceeding the configured limit returns HTTP 413         |
| Declared MIME type | Unsupported type returns HTTP 400                       |
| Resolution         | Only `480p`, `720p`, and `1080p` are accepted           |
| Default resolution | Missing resolution defaults to `720p`                   |
| Download filename  | Path traversal-style filename mismatch returns HTTP 400 |
| Output existence   | Missing output returns HTTP 404                         |

The resolution validation and its associated cleanup were added after the original single-resolution flow.

The system does not yet perform complete media probing, source-resolution validation, codec validation, or file-signature verification.

---

# 6. Transcoding Service

## 6.1 Service interface

The current service interface is:

```js
transcode(inputPath, outputPath, height)
```

Each argument has a specific responsibility:

* `inputPath`: location of the uploaded source video.
* `outputPath`: location where the transcoded video should be written.
* `height`: requested output height in pixels.

The route translates the client's resolution label into the numeric height before calling the service.

## 6.2 FFmpeg execution

The relevant FFmpeg argument pattern is:

```js
[
    "-i", inputPath,
    "-vf", `scale=-2:${height}`,
    outputPath
]
```

The service launches FFmpeg using Node.js's `spawn()` function.

Conceptually, FFmpeg receives a command equivalent to:

```bash
ffmpeg -i input.mp4 -vf scale=-2:720 output.mp4
```

The actual input and output paths are generated by the application.

### Meaning of the arguments

| Argument       | Meaning                                                          |
| -------------- | ---------------------------------------------------------------- |
| `-i`           | Specifies the input file                                         |
| `-vf`          | Applies a video filter                                           |
| `scale=-2:720` | Calculates a compatible width and targets a height of 720 pixels |
| Output path    | Specifies the generated video file                               |

The width is calculated automatically to preserve the source aspect ratio, subject to FFmpeg's scaling constraints.

The selected height changes according to the client's choice.

For example:

| Requested resolution | Scale filter    |
| -------------------- | --------------- |
| `480p`               | `scale=-2:480`  |
| `720p`               | `scale=-2:720`  |
| `1080p`              | `scale=-2:1080` |

These are target dimensions, not a guarantee of increased visual quality. Upscaling a smaller source does not recover missing detail.

## 6.3 Promise and child-process events

The service wraps FFmpeg's event-driven lifecycle in a Promise.

Its conceptual behavior is:

```text
transcode() called
       |
       v
Create Promise
       |
       v
spawn() starts FFmpeg
       |
       +-- "error" event --> reject(error)
       |
       +-- "close" event
                |
                +-- exit code 0 --> resolve()
                |
                +-- other code --> reject(error)
```

The `close` event indicates that the child process has ended and its standard I/O streams have closed. The exit code indicates whether FFmpeg reported successful completion.

The `error` event handles failures to start or otherwise launch the child process.

The Promise allows the route to use `await`, which keeps the orchestration code readable.

---

# 7. POST Route: End-to-End Behavior

The main endpoint is:

```http
POST /
```

Its final URL depends on how the router is mounted in `server.js`. If it is mounted at `/transcode`, the complete endpoint is `POST /transcode`.

## 7.1 Request format

The request uses `multipart/form-data`.

It contains:

| Field        | Type | Required?              |
| ------------ | ---- | ---------------------- |
| `video`      | File | Yes                    |
| `resolution` | Text | No; defaults to `720p` |

Example logical payload:

```text
video: sample.mp4
resolution: 480p
```

## 7.2 Processing sequence

1. Multer parses the incoming multipart request.
2. The upload middleware enforces the size limit and filters the declared MIME type.
3. The handler checks that `req.file` exists.
4. The handler reads the requested resolution, defaulting to `720p`.
5. The requested resolution is validated against `RESOLUTIONS`.
6. A UUID is generated using `randomUUID()`.
7. The output path is built using the UUID and `.mp4` extension.
8. The route invokes `transcode()` with the source path, output path, and numeric height.
9. The route waits for FFmpeg to finish.
10. On success, the route returns the job ID and output filename.
11. On failure, the route logs the error and attempts to delete a partial output.
12. In the `finally` block, the route attempts to delete the uploaded source file.

## 7.3 Unique identifiers

The application uses:

```js
const jobId = randomUUID();
```

This generates a unique identifier for the processing attempt.

The output path follows this pattern:

```js
const outputPath = path.join("outputs", `${jobId}.mp4`);
```

This is a useful foundation for future job tracking. However, **the UUID is not yet a persisted job record**. At present, it identifies the output associated with a synchronous request.

## 7.4 Successful response

The current response structure is:

```json
{
  "message": "Video transcoded successfully",
  "jobId": "generated-uuid",
  "outputFile": "generated-uuid.mp4"
}
```

The values above are illustrative. The real UUID and filename are generated per request.

The client receives this response after transcoding completes.

## 7.5 Failure handling

If FFmpeg fails:

* The error is logged on the server.
* The route attempts to remove the partial output.
* The route returns HTTP 500 with a generic failure message.
* The `finally` block attempts to delete the original uploaded file.

The route should not expose internal process errors to the client. Server logs are used for diagnosis.

## 7.6 Cleanup behavior

The route's cleanup strategy has two parts.

**Partial output cleanup:** The catch block attempts to unlink the output file. An `ENOENT` error is ignored because it means the file does not exist. Other cleanup errors are logged.

**Uploaded source cleanup:** The `finally` block attempts to unlink the temporary source file regardless of whether transcoding succeeded or failed. Cleanup errors are logged.

This is important because uploaded videos and transcoded outputs can consume substantial disk space.

The current implementation does not include a background cleanup process for abandoned files after a machine crash or forced process termination.

---

# 8. Download Endpoint

The download route is:

```http
GET /download/:filename
```

Its complete URL depends on the router mount path. If the router is mounted at `/transcode`, the endpoint is `GET /transcode/download/:filename`.

## 8.1 Download flow

1. The client supplies the output filename.
2. The handler obtains the basename using `path.basename()`.
3. It checks that the basename matches the supplied filename.
4. It constructs the path under `outputs/`.
5. It checks whether the file exists using `access()`.
6. If the file is absent, the route returns HTTP 404.
7. If the file exists, `res.download()` initiates the file download.
8. A download error is logged; the route sends HTTP 500 if response headers have not already been sent.

## 8.2 Why the basename check exists

A filename should refer to a file within the application's output directory, not an arbitrary filesystem path.

The basename check rejects path components that change the supplied filename.

It is a useful basic safeguard, although production-grade file handling should also use robust path resolution and enforce that the resolved path stays within the intended output directory.

## 8.3 Current limitation

Output files are stored locally and remain available until they are manually removed or another cleanup mechanism is implemented.

There is no database record linking an output to a user, retention policy, or ownership check yet.

---

# 9. Current API Contract

| Method | Endpoint                               | Purpose                      |
| ------ | -------------------------------------- | ---------------------------- |
| `POST` | Router root, e.g. `/transcode`         | Upload and transcode a video |
| `GET`  | `/download/:filename` under the router | Download a generated output  |

## 9.1 Current HTTP response behavior

| Scenario                                         | Expected status |
| ------------------------------------------------ | --------------: |
| Valid upload and successful transcode            |             200 |
| Missing video file                               |             400 |
| Unsupported declared MIME type                   |             400 |
| Invalid resolution                               |             400 |
| Upload exceeds size limit                        |             413 |
| Output file does not exist                       |             404 |
| FFmpeg fails                                     |             500 |
| Download operation fails before headers are sent |             500 |

This table documents the intended/current route behavior. Exact error messages and edge-case responses should be confirmed against the current source before publishing the API as a stable external contract.

---

# 10. Important Node.js and Express Concepts Used

## `express.Router()`

Creates a modular router that groups related endpoints. The transcoding endpoints can be mounted into the main Express application without placing all route logic in `server.js`.

## Middleware

Middleware executes as part of the HTTP request pipeline. Multer is middleware because it processes the upload before the route handler runs.

## `next()`

Passes control to the next middleware or route handler when the current middleware has completed successfully.

## `req.file`

Contains information about the uploaded file populated by Multer when `upload.single("video")` succeeds.

## `req.body`

Contains the other parsed multipart form fields, including `resolution`, after Multer has processed the request.

## `spawn()`

Starts FFmpeg as a separate operating-system process. This is preferable to constructing a shell command string for these arguments because the executable and arguments are passed separately.

## `Promise`

Provides a single completion interface around the FFmpeg process lifecycle.

## `async` / `await`

Allows the route to wait for asynchronous operations, such as transcoding, filesystem checks, and cleanup, without nesting callbacks throughout the handler.

## `try` / `catch` / `finally`

* `try`: executes the operation that can fail.
* `catch`: handles the failure.
* `finally`: runs cleanup logic after the attempt, regardless of success or failure.

## `randomUUID()`

Generates a unique identifier to associate the current processing attempt with its output filename.

## `unlink()`

Deletes a filesystem entry, used here to remove temporary source files and partial outputs.

## `access()`

Checks filesystem accessibility/existence before attempting to download an output.

## `res.download()`

Sends the selected file to the client as a download response.

---

# 11. Current Data and State Model

At this stage, the application has files and a transient request lifecycle, but no persistent job database.

| Information          | Where it lives                                |
| -------------------- | --------------------------------------------- |
| Upload metadata      | `req.file`, populated by Multer               |
| Requested resolution | `req.body.resolution`                         |
| Job identifier       | Local route-handler variable                  |
| Input video          | Temporary file in `uploads/`                  |
| Output video         | File in `outputs/`                            |
| Job status           | Not persisted or exposed through a status API |
| Processing progress  | Not tracked                                   |
| Retry count          | Not tracked                                   |
| Worker identity      | Not tracked                                   |
| Job history          | Not stored                                    |

A crucial distinction is that the application does not yet have a true asynchronous job lifecycle.

Although it generates a `jobId`, the current route waits for FFmpeg to finish before returning a successful response. There is no `GET /status/:jobId` endpoint yet.

---

# 12. Testing Status and Verification Checklist

The core transcoding flow and selectable resolutions have been tested successfully during development.

The following checklist records the behaviors that should remain valid as the code evolves.

## Functional tests

* [x] Upload and transcode a valid video.
* [x] Download the generated output.
* [x] Select 480p.
* [x] Select 720p.
* [x] Select 1080p.
* [x] Default to 720p when the resolution is omitted.
* [ ] Confirm actual output dimensions with media metadata inspection.
* [ ] Confirm cleanup after an FFmpeg failure.
* [ ] Confirm cleanup when the input video is malformed.
* [ ] Confirm the size-limit boundary and oversize behavior.
* [ ] Confirm all unsupported MIME types return the intended error.

The unchecked items are verification tasks, not claims that the implementation is broken.

## Operational tests

Before distributed processing is added, it is useful to record:

* Typical transcode duration for a known test video.
* Input and output file sizes.
* Behavior when two requests arrive concurrently.
* Behavior when FFmpeg is not installed or cannot be launched.
* Behavior when the output directory is unavailable or the disk runs out of space.

These tests can be added progressively rather than blocking development on production hardening.

---

# 13. Known Limitations

## Synchronous request handling

The HTTP request remains open while FFmpeg processes the video. Long-running jobs therefore occupy a request lifecycle until completion.

## Single-machine execution

All application logic, processing, and file storage are tied to one machine. There is no independent worker pool.

## Local filesystem dependency

Uploads and outputs are local files. Another server cannot automatically access them unless storage is shared or files are transferred.

## No persistent job state

A process restart loses any in-memory state because there is not yet a job store. The generated output files may remain on disk, but there is no persistent index of their processing history.

## Basic MIME validation

The application trusts the declared MIME type for the initial filter. It does not establish that the file's content is a valid video before starting FFmpeg.

## No source-resolution awareness

The application applies the requested target height without checking the source dimensions. A lower-resolution input can be upscaled to 1080p, which increases dimensions but does not recover missing detail.

## No adaptive streaming

The application generates one MP4 output per request. It does not produce an HLS master playlist, segmented media, or multiple bitrate variants.

## No production-grade retry or recovery mechanism

If the server stops while processing, the application has no queue-based mechanism to reassign the work or automatically recover the job.

---

# 14. Planned Evolution: From MVP to Distributed Processing

The existing implementation is a useful baseline because it already separates the HTTP layer from the FFmpeg service. The next stages should build on this structure rather than rewrite everything at once.

## Phase 1 — Current synchronous MVP

**Status: Functionally implemented**

```text
Client
  ↓
Express + Multer
  ↓
Transcode route
  ↓
FFmpeg service
  ↓
Local output file
  ↓
HTTP response / download
```

The client waits for the work to finish.

## Phase 2 — Job tracking and asynchronous API

Introduce a job record with fields such as:

```text
jobId
status
inputPath
outputPath
requestedResolution
createdAt
startedAt
completedAt
error
```

The lifecycle should eventually be:

```text
QUEUED → PROCESSING → COMPLETED
                    ↘ FAILED
```

The submission endpoint should return a job ID without waiting for the entire transcode to finish. A status endpoint will let the client inspect the job's current state.

An in-memory store can demonstrate this flow initially, but it is temporary: it is lost on restart and cannot coordinate multiple Node.js processes. We should account for that before treating it as distributed job tracking.

## Phase 3 — RabbitMQ job queue

Separate job submission from processing.

```text
Client
  ↓
Express API
  ↓
Job metadata + message publication
  ↓
RabbitMQ queue
  ↓
Independent FFmpeg worker
```

The API accepts requests and publishes jobs. A worker consumes messages and performs transcoding.

This is the first meaningful distributed-processing milestone.

## Phase 4 — Independent workers

Workers run outside the Express request handler and can be started independently.

The worker will:

1. Consume a job message.
2. Read the input video.
3. Perform the requested transcode.
4. Record success or failure.
5. Update the job state.
6. Acknowledge the message only according to the queue-processing strategy.

At this stage, input and output storage must be accessible to both the API and workers. That could initially be a shared volume in a local Docker environment; a remote object store can be considered later.

## Phase 5 — Multiple jobs and workers

Test multiple uploads, concurrent jobs, worker failures, and queue behavior.

The key question changes from “Can FFmpeg convert this video?” to “Can the system reliably coordinate many independent video-processing jobs?”

Important areas to design and test include:

* Worker concurrency limits.
* Duplicate delivery and idempotency.
* Retry policy.
* Failed-message handling.
* Queue durability.
* Shared storage.
* Job-state consistency.

## Phase 6 — Adaptive bitrate streaming

**Deferred until the distributed pipeline works.**

This phase introduces HLS output, multiple encoded variants, a master playlist, and media segments. A compatible player can then switch between quality levels based on network conditions.

This is different from the current resolution selector: today, each request generates one selected resolution; adaptive streaming will eventually generate a set of representations for a single source video.

---

# 15. Decisions and Scope Boundaries

These decisions should guide upcoming work:

1. Preserve the existing synchronous implementation as a working baseline.
2. Keep the 480p, 720p, and 1080p resolution selector.
3. Defer source-resolution checks and user-friendly upscaling warnings.
4. Do not implement adaptive streaming yet.
5. Introduce asynchronous job handling and distributed processing incrementally.
6. Avoid spending excessive time polishing nonessential validations before the distributed pipeline works.
7. Keep route handling, job orchestration, and FFmpeg execution separated by responsibility.
8. Treat local storage and any temporary in-memory job store as development-stage choices, not final distributed architecture decisions.

---

# 16. MVP Completion Summary

The current application is a functional single-server video transcoder. It accepts an upload, performs basic validation, lets the client choose a target output height, invokes FFmpeg, returns the generated filename and job ID, and exposes a download endpoint.

The codebase has a small modular structure:

* `server.js` initializes the application.
* `constants.js` centralizes shared settings.
* `transcode.routes.js` handles HTTP behavior and request orchestration.
* `transcode.service.js` encapsulates FFmpeg execution.
* `uploads/` and `outputs/` provide local working storage.

The current architecture is deliberately synchronous. It is not yet a distributed transcoding system, but it establishes the video-processing functionality that the distributed implementation will build upon.

**Next engineering milestone:** introduce job tracking and asynchronous job submission, then integrate RabbitMQ and independent FFmpeg workers.

The guiding principle is to evolve a working transcoder into a distributed processing system—not to rebuild the transcoder from scratch.
