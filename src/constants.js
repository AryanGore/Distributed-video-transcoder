export const MAX_UPLOAD_SIZE = Number(process.env.MAX_UPLOAD_SIZE_MB || 1024) * 1024 * 1024;
export const RESOLUTIONS = {
    "480p": 480,
    "720p": 720,
    "1080p": 1080
}

export const JOB_STATUS = {
    QUEUED: "QUEUED",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED"
};

export const JOB_TRANSITIONS = {
    [JOB_STATUS.QUEUED]: [
        JOB_STATUS.PROCESSING,
        JOB_STATUS.FAILED
    ],

    [JOB_STATUS.PROCESSING]: [
        JOB_STATUS.FAILED,
        JOB_STATUS.COMPLETED
    ],

    [JOB_STATUS.COMPLETED]: [],
    [JOB_STATUS.FAILED]: []

};