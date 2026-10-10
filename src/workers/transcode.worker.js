import "dotenv/config";

import { claimNextJob, updateJobStatus } from "../repositories/job.repository.js";
import { transcode } from "../services/transcode.service.js";
import { RESOLUTIONS } from "../constants.js";

async function processNextJob() {
    const job = await claimNextJob();

    if(!job) {
        return false;
    }

    console.log(`Processing Job ${job.id}`);

    try{
        const height = RESOLUTIONS[job.resolution];

        await transcode(job.input_path, job.output_path, height);

        await updateJobStatus(job.id, "COMPLETED");

        console.log(`Job ${job.id} Completed Successfully.`);
    }catch (error) {
        console.error(`Job ${job.id} failed: `, error.message);

        await updateJobStatus(job.id, "FAILED", error.message);

    }

    return true;
}

async function main() {
    console.log("Transcode worker Started");

    while(true){
        const foundJob = await processNextJob();

        if(!foundJob) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

main().catch(error => {
    console.error("Worker Crashed: ", error);
    process.exitCode = 1;
})