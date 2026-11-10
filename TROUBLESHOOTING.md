# Troubleshooting

## Screen capture permission denied

Grant your browser or operating system screen-sharing permission, then select **Share chart screen** again. Analysis can also run using the terminal's deterministic local sample price series.

## Local endpoint unavailable

Start the terminal with `npm run dev`, then verify `GET /api/health` responds successfully.

## SQLite write error

Ensure the process may write to the project `data` directory (or the serverless temporary directory).
