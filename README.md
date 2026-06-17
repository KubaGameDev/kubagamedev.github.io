# Jumpkat Website

Unity solutions and indie mobile games from Newcastle upon Tyne.

## Local Development

To run the website locally on your machine (macOS, Linux, or Windows):

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Mac, Windows, or Linux)
- Docker Compose (included with Docker Desktop)

### Running Locally

From the root directory of this project, simply run:

```bash
docker compose up --build
```

The website will be available at **http://localhost:5000**

To stop the server, press `Ctrl+C` in the terminal, or run:

```bash
docker compose down
```

### What's Included

- All HTML pages (home, blog, contact, games)
- Static assets (CSS, JavaScript, images)
- Interactive games (Pong, Snake, Tower Builder, Juggle Cats)

## Technical Details

The local development setup uses:
- **Flask** (Python web framework) to serve static files
- **Docker** to containerize the application
- **Docker Compose** for easy orchestration

See the `server/` directory for implementation details.

## Production

This site is hosted on GitHub Pages at [jumpkat.com](https://jumpkat.com).
