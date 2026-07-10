# Local Development with Docker

This setup allows you to run the website locally using Docker and Docker Compose.

## Prerequisites

- Docker
- Docker Compose

## Running the Website Locally

From the root directory of the project, run:

```bash
docker compose up --build
```

The website will be available at `http://localhost:5000`

To stop the server, press `Ctrl+C` or run:

```bash
docker compose down
```

## How It Works

- The Flask Python server serves all static files (HTML, CSS, JS, images)
- The server runs inside a Docker container on port 5000
- All website files are mounted as a volume, so changes are reflected immediately without rebuilding
