# TODO

- [ ] Add abuse prevention measures — warn the user their birthday can only be changed once every 2 weeks, and enforce this in the DB (store `lastUpdatedAt` and reject updates that are too soon); also ensure a birthday announcement can only fire once per calendar year per user (a `lastPostedYear` column or a check against `lastPostedAtUtc` local year would suffice).
- [ ] Add a `/birthday_timezone_lookup <query>` command with autocomplete so users can search and confirm their exact IANA zone before saving, rather than relying on the free-text resolver.
- [ ] Add a note to the confirmation message for Feb 29 birthdays explaining they'll be greeted on Feb 28 in non-leap years.
- [ ] Check guild membership before posting a birthday announcement — skip or flag the message if the user has left the server.
- [ ] Improve audit log messages to use Discord embeds with colour coding (green add, yellow update, red remove) and a timestamp footer.
- [ ] Add a `--no-discord` flag to the CLI scripts to skip the REST audit post (useful for offline maintenance or testing).
- [ ] Add rate-limit-aware queuing for REST posts to `BIRTHDAY_POST_CHANNEL` in case multiple birthdays fall on the same day.
- [ ] Validate that both configured channel IDs are reachable at startup and fail fast with a `ConfigError` if not.
- [ ] Add a `/next_birthday` slash command (admin-only or unrestricted, to be decided) that returns an ephemeral reply showing whose birthday is coming up next and on what date.
