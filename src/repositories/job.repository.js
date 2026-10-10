import { pool } from "../configs/db.js";
import { JOB_STATUS, JOB_TRANSITIONS } from "../constants.js";

export async function createJob({
    id,
    inputPath,
    outputPath,
    resolution
}) {
    const query = `
        INSERT INTO jobs(
            id,
            input_path,
            output_path,
            resolution
        )
        VALUES ($1,$2,$3,$4)
        RETURNING *;    
    `;

    const values = [
        id, 
        inputPath,
        outputPath,
        resolution
    ];

    const result = await pool.query(query, values);

    return result.rows[0];
}


export async function getJobById(id) {
    const query = `
        SELECT * 
        FROM jobs
        WHERE id = $1;
    `;

    const result = await pool.query(query, [id]);

    return result.rows[0] || null;
}

export async function updateJobStatus(id, status, errorMessage=null) {
    const allowedStatuses = Object.values(JOB_STATUS);

    if(!allowedStatuses.includes(status)){
        throw new Error(`Invalid job Status : ${status}`);
    }

    const currentJob = await getJobById(id);

    if(!currentJob){
        return null;
    }

    const allowedTransitions = JOB_TRANSITIONS[currentJob.status];

    if(!allowedTransitions.includes(status)){
        throw new Error(`Invalid Status Transition: ${currentJob.status} -> ${status}`);
    }
    const query = `
        UPDATE jobs
        SET 
            status = $2::text,
            error_message = $3,
            started_at = CASE
                WHEN $2::text = 'PROCESSING' AND started_at IS NULL
                THEN NOW()
                ELSE started_at
            END,
            completed_at = CASE
                WHEN $2::text IN ('COMPLETED', 'FAILED')
                THEN NOW()
                ELSE completed_at
            END
        WHERE id = $1
        RETURNING *;
    `;

    const values = [id, status, errorMessage];

    const result = await pool.query(query, values);

    return result.rows[0] || null;
}

export async function claimNextJob() {
    const client = await pool.connect();

    try{
        await client.query("BEGIN");

        const result = await client.query(`
            SELECT *
            FROM jobs
            WHERE status = 'QUEUED'
            ORDER BY created_at ASC
            LIMIT 1 
            FOR UPDATE SKIP LOCKED;
        `);

        const job = result.rows[0];

        if(!job){
            await client.query("COMMIT");
            return null;
        }

        const updated = await client.query(`
            UPDATE jobs
            SET
                status = 'PROCESSING',
                started_at = NOW()
            WHERE id = $1
            RETURNING *;    
        `, [job.id]);

        await client.query("COMMIT");
        return updated.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally{
        client.release();
    }

}