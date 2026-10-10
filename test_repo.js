import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pool } from "./src/configs/db.js";
import {
    createJob,
    getJobById,
    updateJobStatus
} from "./src/repositories/job.repository.js";

try {
    const createdJob = await createJob({
        id: randomUUID(),
        inputPath: "uploads/test-video.mp4",
        outputPath: "outputs/test-video.mp4",
        resolution: "720p"
    });

    console.log("Created job:");
    console.table(createdJob);

    console.log("Raw created_at:", createdJob.created_at);
console.log("Raw started_at:", createdJob.started_at);

    const updatedJob = await updateJobStatus(
        createdJob.id,
        "PROCESSING"
    );

    console.log("Updated job:");
    console.table(updatedJob);

    const retrievedJob = await getJobById(createdJob.id);

    console.log("Retrieved job:");
    console.table(retrievedJob);

    const completedJob = await updateJobStatus(
        createdJob.id,
        "COMPLETED"
    );

    console.log("Completed job:");
    console.table(completedJob);

} catch (err) {
    console.error("Repository test failed:", err.message);
} finally {
    await pool.end();
}

