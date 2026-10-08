import {spawn} from "node:child_process"; //nodes way to spawn external programs and run them as a separate process.

export function transcode(inputPath, outputPath){
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", ["-i", inputPath, "-vf", "scale=-2:720", outputPath]);  // spawn (program , cmdline-arguments in array same as (process.argv of node))
        
        ffmpeg.on("close", (code) => {
            if(code === 0){
                resolve();
            }else{
                reject(new Error(`FFmpeg exited with code : ${code}`));
            }
        });  
        
        ffmpeg.on("error", (error)=> {
            reject(error);
        })
    });
}