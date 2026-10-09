import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from "node:path"
import { access } from 'node:fs/promises';
import { transcode } from '../services/transcode.service.js';
import { MAX_UPLOAD_SIZE, RESOLUTIONS } from '../constants.js';
import { error } from 'node:console';
import { unlink } from 'node:fs/promises';

const router = express.Router();

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
        ]

        if(allowedTypes.includes(file.mimetype)) {
            callback(null , true);
        }else{
            callback(new Error("Unsupported Video Format"));
        }
    }
});

function handleUpload(req, res, next) {
    upload.single("video")(req, res , (error) => {
        if(!error){
            return next();
        }

        if(error instanceof multer.MulterError){
            if(error.code === "LIMIT_FILE_SIZE"){
                return res.status(413).json({
                    message: "Video exceeds the upload size limit."
                })
            }

            return res.status(400).json({
                message: "Invalid upload"
            })
        }

        if(error.message === "Unsupported Video Format"){
            return res.status(400).json({
                message: "Unsupported video Format. Upload mp4 , webM, MOV, MKV."
            });
        }

        next(error);
    })
}


router.post("/", handleUpload , async (req, res) => {
    const outputPath = path.join("outputs", `${randomUUID()}.mp4`);

    if(!req.file) {
        return res.status(400).json({
            message: "Please upload Video"
        })
    }

    const resolution = req.body.resolution || "720p";
    if(!(resolution in RESOLUTIONS)){
        await unlink(req.file.path);

        return res.status(400).json({
            message: "Invalid Resolution. Choose 480p, 720p, 1080p"
        })
    }
    try{
        await transcode(req.file.path, outputPath, RESOLUTIONS[resolution]); //inputpath, outputpath.
        res.json({
            message: "Video Transcoded Successfully.",
            outputFile: path.basename(outputPath) 
        })
    }catch(error){
        console.error("Transcoding failed: ", error);

        try{
            await unlink(outputPath);
        }catch(cleanupError){
            if(cleanupError.code !== "ENOENT"){
                console.error("Failed to delete partial Output: ", cleanupError);
            }
        }

        res.status(500).json({
            message: "video transcoding failed."
        })
    }finally{
        try{
            await unlink(req.file.path);
        }catch(error){
            console.error("Failed to delete Uploaded Video: ", error);
        }
    }

});


router.get("/download/:filename", async (req, res) => {

    const filename = path.basename(req.params.filename);

    if(filename !== req.params.filename){
        res.status(400).json({
            message: "Invalid Filename."
        })
    }

    const filePath = path.join("outputs", filename);
    try{
        await access(filePath);
    }catch(error){
        return res.status(404).json({
            message: "Output Video Not Found"   
        })
    }
    res.download(filePath, (error) => {
        if(error){
            console.error("Download failed: ", error);

            if(res.headersSent){
                res.status(500).json({
                    message: "Failed to download video"
                })
            }
        }
    });
})

export default router;