import express from "express";
import app from "./dist/index.mjs";

const entry = express();
entry.use(app);

export default entry;