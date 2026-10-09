import "dotenv/config";
import express from 'express';
import { mkdir } from 'node:fs/promises'
import transcodeRouter from './routes/transcode.routes.js';


const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/" , (req, res) => {
    res.json({
        message: "Video Transcoder API is Healthy"
    });
})

app.use("/transcode", transcodeRouter);


await mkdir("outputs", { recursive: true});
await mkdir("uploads", { recursive: true});

app.listen(PORT, () => {
    console.log(`Server is running at PORT ${PORT || 3000}`);
})

