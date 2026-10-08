import "dotenv/config";
import express from 'express';


const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/" , (req, res) => {
    res.json({
        message: "Video Transcoder API is Healthy"
    });
})

app.listen(PORT, () => {
    console.log(`Server is running at PORT ${PORT || 3000}`);
})

