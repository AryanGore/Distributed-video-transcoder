import express from 'express';
import multer from 'multer';
import { transcode } from '../services/transcode.service.js';

const router = express.Router();

const upload = multer({
    dest: "uploads/"
});


router.post("/", upload.single("video"), async (req, res) => {
    const outputPath = "outputs/output.mp4"
    console.log(req.file);

    await transcode(req.file.path, outputPath);
    res.json({
        message: "Video uploaded Successfully"
    })
})

export default router;