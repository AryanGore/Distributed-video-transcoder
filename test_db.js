import "dotenv/config";
import { pool } from "./src/configs/db.js";

const createJobsTable = `
    CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY,
        status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
        input_path TEXT NOT NULL,
        output_path TEXT NOT NULL,
        resolution VARCHAR(10) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT
    );
`;

try {
const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'jobs'
    ORDER BY ordinal_position;
`);

console.table(result.rows);
} catch (err) {
    console.error("Failed to create jobs table:", err.message);
} finally {
    await pool.end();
}

