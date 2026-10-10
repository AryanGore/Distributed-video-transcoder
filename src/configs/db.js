import pg from "pg";
const {Pool} = pg;

export const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || "transcoder",
    user: process.env.DB_USER || "transcoder_user",
    password: process.env.POSTGRES_PASSWORD
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQl pool error: ", err);
});

