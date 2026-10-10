import express from 'express';
import { getJobById } from '../repositories/job.repository.js';

const router = express.Router();

router.get("/:id", async (req, res) => {
    try{
        const job = await getJobById(req.params.id);

        if(!job){
            return res.status(404).json({
                message: "Job Not Found"
            });
        }

        return res.status(200).json({
            id: job.id,
            status: job.status,
            resolution: job.resolution,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt
        })
    }catch(error){
        console.error("Failed to fetch Job: ", error);

        return res.status(500).json({
            message: "Failed to retrieve job status."
        });
    }


})


export default router;