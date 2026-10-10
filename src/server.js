import "dotenv/config";
import express from 'express';
import { mkdir } from 'node:fs/promises'
import transcodeRouter from './routes/transcode.routes.js';
import jobRouter from './routes/jobs.routes.js';


const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/" , (req, res) => {
    res.json({
        message: "Video Transcoder API is Healthy"
    });
})

app.use("/transcode", transcodeRouter);
app.use("/jobs", jobRouter);

await mkdir("outputs", { recursive: true});
await mkdir("uploads", { recursive: true});

const server = app.listen(PORT || 3000, () => {
    console.log("Server listening on port :", PORT);
});

server.on("error", (err) => {
    console.error("Server failed to start:", err);
});