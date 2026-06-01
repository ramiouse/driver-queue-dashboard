module.exports = {
  apps: [
    {
      name: "backend-toa3",
      cwd: "D:/codes/CODES/sleekpremium/drivercall/_launching/v01.5/backend",
      script:
        "D:/codes/CODES/sleekpremium/drivercall/_launching/v01.5/backend/venv/Scripts/uvicorn.exe",
      args: "main:app --host 0.0.0.0 --port 8800 --loop asyncio --timeout-keep-alive 30 --ssl-keyfile=key.pem --ssl-certfile=cert.pem --log-level warning",
      interpreter: "none",
      exec_mode: "fork",
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PYTHONIOENCODING: "utf8",
      },
    },
  ],
};
