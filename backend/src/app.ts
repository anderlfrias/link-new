import express from "express";

const app = express();

app.get("/", (_req, res) => {
  res.send("Backend is running");
});

export default app;
