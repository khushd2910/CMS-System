const dotenv = require("dotenv");
dotenv.config();

const express=require("express");
const cors=require("cors");
const connectDB=require("./config/db");

const app=express();
app.use(cors());
app.use(express.json());


app.get("/",(req,res)=>{
    res.send("Hello World");
}); 

const PORT=process.env.PORT || 3000;

async function startServer() {
    await connectDB();
    app.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`);
    });
}

startServer().catch((error)=>{
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode=1;
});