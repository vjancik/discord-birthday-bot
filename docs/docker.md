# Docker

## Running in production

Copy `.env.example` to `.env` and fill in all required values, then:

```bash
bun run prod:up    # build image and start detached
bun run prod:down  # stop and remove container
```

Logs:

```bash
docker compose logs -f app
```

## Volume and database file

The SQLite database is persisted via a bind mount:

```
./data/  →  /usr/src/app/data/  (inside container)
```

The container runs as the `bun` user (uid 999), so `./data/birthdays.sqlite` on the host will be owned by uid 999. To read or inspect the file from the host without `sudo`, either:

- Run host-side tooling as root: `sudo sqlite3 ./data/birthdays.sqlite`
- Or temporarily `chown` the file back after maintenance and restore ownership before restarting the container

## Running CLI scripts inside the container

All scripts in `scripts/` are available inside the running container at `/usr/src/app/scripts/`. The `.env` file is loaded automatically by Bun, so no extra environment setup is needed.

Find the running container name:

```bash
docker compose ps
```

### Register slash commands

Run once after first deploy, or after adding/changing commands:

```bash
docker compose exec app bun run register-commands
```

### Add a birthday manually

```bash
docker compose exec app bun run birthday:add <userId> <DD.MM.> <timezone> [year]
```

Example:

```bash
docker compose exec app bun run birthday:add 123456789012345678 24.12. Prague 1990
```

### Remove a birthday manually

```bash
docker compose exec app bun run birthday:remove <userId>
```

Example:

```bash
docker compose exec app bun run birthday:remove 123456789012345678
```

## Running scripts without a running container

If the container is not running (e.g. during maintenance), start a one-off container with the same env and volume:

```bash
docker compose run --rm app bun run birthday:add 123456789012345678 24.12. Prague 1990
```

This spins up a fresh container, runs the command, then removes the container. The database file on the host is the same volume, so changes persist.
